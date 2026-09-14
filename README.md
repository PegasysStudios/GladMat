# GladMat

GldMat is an internal creative-production tool that turns one event or show flyer into multiple independently recomposed advertising formats. It analyzes the source once, preserves confirmed copy and campaign identity, then makes one reference-image edit request for every selected size.

The application is deliberately not a generic image generator. Every output uses the original artwork as its authoritative visual reference, a structured design analysis, format-specific composition guidance, and exact pixel post-processing.

## What it includes

- Drag-and-drop or browse upload for PNG, JPG, JPEG, and WEBP artwork up to 20 MB
- Direct, path-scoped upload to a private Supabase Storage bucket, followed by server-side Sharp verification and normalization
- Structured GPT-5.6 Sol vision analysis with OCR-focused exact-copy extraction
- Optional, collapsed copy review before generation
- All 17 requested display-ad presets plus validated custom dimensions
- Independent image-edit requests for every selected format
- Browser-side generation queue with concurrency limited to two jobs
- Per-format `queued`, `generating`, `processing`, `complete`, and `error` states
- Optional automated vision QA with one corrective retry and a `Needs review` result state
- Exact final PNG sizing through proportional Sharp crop/resize—never non-proportional stretching
- Orientation-aware result cards, accessible large-preview dialog, individual regeneration, and signed downloads
- ZIP creation containing only available successful PNGs
- Friendly configuration and service errors without exposing upstream details or secrets

## Architecture

```text
Browser
  ├─ request path-scoped signed upload
  ├─ upload source directly to private Supabase Storage
  ├─ request server verification + normalization
  ├─ request one source analysis
  └─ run at most two independent /api/generate streams at once

Next.js route handlers (Node.js runtime)
  ├─ validate every request with strict Zod schemas
  ├─ verify a short-lived HMAC session capability
  ├─ download only server-derived private storage paths
  ├─ call OpenAI Responses for structured vision analysis
  ├─ call OpenAI Images edit once per target/attempt with the source image
  ├─ stream truthful generating/processing state to the browser
  ├─ force exact output dimensions with Sharp
  └─ upload outputs and archives, then return signed URLs
```

There is no database, ORM, application authentication, or global state framework. The browser keeps the active workflow in React state. Analysis JSON is stored privately beside the canonical source so generation does not trust a client-supplied analysis object.

### Routes

- `POST /api/upload` — prepares a signed upload and then verifies/normalizes the uploaded source
- `POST /api/analyze` — creates and stores the structured source-artwork analysis
- `POST /api/generate` — accepts exactly one target and streams NDJSON status plus the final asset
- `POST /api/assets/sign` — refreshes a validated generated-asset preview URL
- `POST /api/download` — returns a short-lived, content-disposition-aware signed PNG download
- `POST /api/download-zip` — verifies successful assets, creates a private ZIP, and returns its signed download

### Private storage layout

```text
sources/{sessionId}/original.{png|jpg|webp}
sources/{sessionId}/source.png
sources/{sessionId}/analysis.json
generated/{sessionId}/{width}x{height}/{requestId}.png
archives/{sessionId}/{archiveId}.zip
```

Per-attempt request IDs prevent regeneration races from overwriting a previous successful asset.

## Tech stack

- Next.js 16.3.5, App Router, TypeScript, React 19
- Tailwind CSS 4 with Radix/shadcn-style accessible primitives
- OpenAI official Node SDK
- Supabase JavaScript client and private Storage
- Sharp, JSZip, Zod, Lucide, UUID-compatible Web Crypto IDs
- Vitest for logic and image-processing tests

## Local setup

Requirements:

- Node.js 20.9 or later
- npm
- An OpenAI API project with access to the configured analysis and image models
- A Supabase project with a private Storage bucket

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env.local
openssl rand -hex 32
```

Paste the generated secret and the credentials described below into `.env.local`, then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The UI intentionally loads without credentials. A server feature returns a clear setup message only when it is invoked.

## Environment variables

```dotenv
OPENAI_API_KEY=your_openai_project_api_key
OPENAI_ANALYSIS_MODEL=gpt-5.6-sol
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
OPENAI_IMAGE_QUALITY=high
ENABLE_IMAGE_VALIDATION=false

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret
SUPABASE_STORAGE_BUCKET=ad-mats

ADMAT_SESSION_SECRET=a_random_secret_of_at_least_32_characters
```

`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMAT_SESSION_SECRET` are server-only. Do not prefix them with `NEXT_PUBLIC_`. Source uploads still go directly to private storage using a short-lived, single-path signed upload URL created by the server, so the browser never needs a public Supabase URL or anon key. `NEXT_PUBLIC_SUPABASE_URL` is still accepted as a local fallback if `SUPABASE_URL` is unset.

Set `ENABLE_IMAGE_VALIDATION=true` to enable the optional post-generation vision check. A severe failure triggers at most one additional paid image-generation attempt. If that correction still fails quality review, the final image remains downloadable but is marked `Needs review`.

## Supabase setup

1. Create a Supabase project.
2. Open **Storage** and create a bucket named `ad-mats`.
3. Keep the bucket **private**.
4. Set the bucket file-size limit to at least 20 MB.
5. If desired, restrict allowed MIME types to `image/png`, `image/jpeg`, `image/webp`, `application/json`, and `application/zip`. The application also validates source types itself.
6. In **Project Settings → API**, copy the project URL to `SUPABASE_URL`.
7. Copy the service-role secret to `SUPABASE_SERVICE_ROLE_KEY`. Keep it server-side only.
8. Set `SUPABASE_STORAGE_BUCKET=ad-mats`. The publishable/anon key is not required.

No custom bucket policy is required for the server-side service-role operations. The browser never receives the service-role key. Its source upload is authorized only by the server-created signed upload URL. Do not make the bucket public.

## OpenAI setup

1. Create or choose an API project in the OpenAI Platform.
2. Add billing/credits and confirm that the project can use `gpt-5.6-sol` and `gpt-image-2.5-sunburst`.
3. Create a project API key and place it in `OPENAI_API_KEY`.
4. Keep `OPENAI_ANALYSIS_MODEL=gpt-5.6-sol` for source analysis and optional QA.
5. Keep `OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst` for reference-image editing.
6. `OPENAI_IMAGE_QUALITY=high` is the production default. Supported configured values are `low`, `medium`, `high`, `xhigh`, `max`, and `auto`.

Each target size is a separate paid image-edit request. Optional QA adds analysis calls and may add one more image-edit request for a severe first-attempt failure.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover the required presets, aspect classification, model-canvas normalization, prompt assembly, dimension/request schemas, filename generation, ZIP manifest behavior, bounded concurrency, and exact Sharp PNG dimensions.

## Vercel deployment

1. Import this directory as a new Vercel project using the Next.js framework preset.
2. Use Node.js 20 or later.
3. Add every variable from `.env.local` under **Project Settings → Environment Variables** for Production and any Preview environments that should work. Use `SUPABASE_URL` rather than any `NEXT_PUBLIC_` name.
4. Generate a separate strong `ADMAT_SESSION_SECRET` for production.
5. Ensure the plan/project permits the generation route's declared maximum duration of 300 seconds; image generation can take several minutes.
6. Prefer a Vercel region near the Supabase project to reduce private-asset transfer latency.
7. Enable Vercel Deployment Protection, an access gateway, or equivalent restrictions. This MVP intentionally has no in-app authentication, and its AI endpoints should not be left publicly available.
8. Deploy. Vercel runs `npm run build` automatically.

Source uploads go directly to Supabase using a narrow signed token, avoiding serverless request-body limits for 20 MB files. ZIP files are also stored privately and downloaded through a short-lived signed URL, avoiding large serverless response bodies.

## Known limitations

- Generation queue concurrency is enforced per open browser workflow. Without a durable database/queue, it is not a global distributed rate limiter across every Vercel instance.
- Workflow state is not persisted in a database; refreshing the page starts a new session.
- Source originals, generated attempts, and archives are retained in Storage. Configure a Supabase lifecycle/cleanup routine appropriate for your organization.
- Signed preview URLs expire; the UI refreshes generated preview URLs on demand.
- Extremely wide or narrow ad ratios exceed the image model's canvas ratio limits. AdMat uses the closest supported high-resolution canvas, explicitly reserves a target-ratio safe crop, then performs a proportional center crop to exact pixels.
- A successful technical generation is not proof that every visual detail is publication-ready.

## Required human review

AI-generated marketing assets must be reviewed before publishing. Pay special attention to:

- proper names and artist likeness
- dates, times, prices, and ticket information
- venue and location details
- URLs and calls to action
- logos, sponsor marks, and legal copy
- text clipping at very small or extreme aspect ratios

The copy-review control and optional automated QA reduce risk, but they do not replace a final human production check.
