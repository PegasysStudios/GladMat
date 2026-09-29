-- Additive migration. Run once in the existing Supabase SQL editor before enabling jobs.
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('analysis','generation','studio')),
  session_id uuid not null,
  operation_key text not null,
  input_digest text not null,
  input jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','complete','error','cancelled')),
  run_id text,
  revision integer not null default 0,
  retry_scope integer not null default 0,
  retry_scopes jsonb not null default '{}'::jsonb,
  phase text not null default 'queued',
  attempt integer not null default 1,
  preparation_id uuid,
  progress jsonb,
  result jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, kind, operation_key)
);
create table public.ai_job_steps (
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  step_key text not null,
  status text not null default 'requested' check (status in ('requested','submitting','polling','provider_complete','complete','error')),
  request_path text not null,
  response_id text,
  result_path text,
  error jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (job_id, step_key)
);
alter table public.ai_jobs enable row level security;
alter table public.ai_job_steps enable row level security;
revoke all on public.ai_jobs, public.ai_job_steps from anon, authenticated;
grant all on public.ai_jobs, public.ai_job_steps to service_role;

-- One workflow owns a job; duplicate dispatches cannot invoke AI twice.
-- Generation concurrency is enforced across tabs/functions in a session.
create or replace function public.claim_ai_job(p_job_id uuid, p_run_id text, p_revision integer)
returns text language plpgsql security definer set search_path = public as $$
declare j ai_jobs; active integer;
begin
  select * into j from ai_jobs where id = p_job_id;
  if not found then return 'stopped'; end if;
  perform pg_advisory_xact_lock(hashtextextended(j.session_id::text || j.kind, 0));
  select * into j from ai_jobs where id = p_job_id for update;
  if j.revision <> p_revision or j.status in ('complete','error','cancelled') then return 'stopped'; end if;
  if j.run_id is not null and j.run_id <> p_run_id then return 'stopped'; end if;
  if j.status = 'queued' then
    select count(*) into active from ai_jobs where session_id = j.session_id and kind = j.kind and status = 'running';
    if active >= case when j.kind = 'studio' then 1 else 2 end then return 'waiting'; end if;
  end if;
  update ai_jobs set status = 'running', run_id = p_run_id, updated_at = now() where id = p_job_id;
  return 'claimed';
end $$;
create or replace function public.resume_ai_job(p_job_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare j ai_jobs; next_scope integer; next_scopes jsonb; target text;
begin
  select * into j from ai_jobs where id = p_job_id for update;
  if j.status = 'error' then
    -- Uncertain submissions cannot be replayed automatically: they may have incurred a charge.
    if exists (select 1 from ai_job_steps where job_id = p_job_id and status = 'submitting') then
      raise exception 'Submission outcome unknown; explicit new request required';
    end if;
    next_scope := j.retry_scope;
    next_scopes := j.retry_scopes;
    if j.kind = 'studio' and j.error->>'code' in ('STUDIO_FAILED','STUDIO_SELECTION_INVALID','ANALYSIS_FAILED') then
      next_scope := next_scope + 1;
      if j.error->>'stage' = 'analyzing' then
        next_scopes := jsonb_set(next_scopes, '{analyzing}', to_jsonb(next_scope), true);
      elsif j.error->>'stage' = 'extracting' then
        if jsonb_array_length(coalesce(j.error->'layerIds', '[]'::jsonb)) = 0 then
          next_scopes := jsonb_set(next_scopes, '{layers}', to_jsonb(next_scope), true);
        else
          for target in select jsonb_array_elements_text(j.error->'layerIds') loop
            next_scopes := jsonb_set(next_scopes, array['layer:' || target], to_jsonb(next_scope), true);
          end loop;
        end if;
      else
        next_scopes := jsonb_set(next_scopes, '{background}', to_jsonb(next_scope), true);
      end if;
    end if;
    update ai_jobs set status = 'queued', run_id = null, revision = revision + 1,
      retry_scope = next_scope, retry_scopes = next_scopes,
      error = null, updated_at = now() where id = p_job_id returning revision into j.revision;
  end if;
  return j.revision;
end $$;
revoke all on function public.claim_ai_job(uuid,text,integer), public.resume_ai_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_job(uuid,text,integer), public.resume_ai_job(uuid) to service_role;

-- Move a terminal job's operation key aside and create a fresh job atomically.
-- Unknown submissions require an explicit caller acknowledgement.
create or replace function public.restart_ai_job(p_job_id uuid, p_allow_unknown boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare j ai_jobs; new_id uuid; original_key text;
begin
  select * into j from ai_jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  -- A second click may have read the old job before the first transaction
  -- retired it. Return its already-created replacement instead of issuing
  -- a third provider attempt.
  if right(j.operation_key, length(':retired:' || j.id::text)) = ':retired:' || j.id::text then
    original_key := left(j.operation_key, length(j.operation_key) - length(':retired:' || j.id::text));
    select id into new_id from ai_jobs
      where session_id = j.session_id and kind = j.kind and operation_key = original_key;
    if new_id is null then raise exception 'Replacement job not found'; end if;
    return new_id;
  end if;
  if j.status <> 'cancelled' and not (j.status = 'error' and j.error->>'code' = 'AI_SUBMISSION_UNKNOWN' and p_allow_unknown) then
    raise exception 'Job cannot be restarted';
  end if;
  update ai_jobs set operation_key = j.operation_key || ':retired:' || j.id::text, updated_at = now() where id = j.id;
  insert into ai_jobs (kind, session_id, operation_key, input_digest, input)
    values (j.kind, j.session_id, j.operation_key, j.input_digest, j.input)
    returning id into new_id;
  return new_id;
end $$;
revoke all on function public.restart_ai_job(uuid,boolean) from public, anon, authenticated;
grant execute on function public.restart_ai_job(uuid,boolean) to service_role;
