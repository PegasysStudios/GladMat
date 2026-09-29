"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { postJson, triggerBrowserDownload } from "@/lib/api-client";
import {
  createSavedAdMat,
  parseSavedAdMats,
  SAVED_ADMATS_STORAGE_KEY,
  savedAdMatId,
  serializeSavedAdMats,
} from "@/lib/saved-admats";
import type { GenerationJob, SavedAdMat, SourceAsset } from "@/lib/types";

const STORAGE_ERROR = "Your browser could not update the saved AdMats library.";
const localSubscribers = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  function syncFromStorage(event: StorageEvent) {
    if (event.key === SAVED_ADMATS_STORAGE_KEY) onStoreChange();
  }
  localSubscribers.add(onStoreChange);
  window.addEventListener("storage", syncFromStorage);
  return () => {
    localSubscribers.delete(onStoreChange);
    window.removeEventListener("storage", syncFromStorage);
  };
}

function getSnapshot() {
  return localStorage.getItem(SAVED_ADMATS_STORAGE_KEY);
}

function getServerSnapshot() {
  return null;
}

function notifyLocalSubscribers() {
  for (const subscriber of localSubscribers) subscriber();
}

export function useSavedAdMats() {
  const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const items = useMemo(() => parseSavedAdMats(storedValue), [storedValue]);

  const replaceItems = useCallback((next: SavedAdMat[]) => {
    try {
      if (next.length) {
        localStorage.setItem(SAVED_ADMATS_STORAGE_KEY, serializeSavedAdMats(next));
      } else {
        localStorage.removeItem(SAVED_ADMATS_STORAGE_KEY);
      }
      notifyLocalSubscribers();
    } catch {
      return STORAGE_ERROR;
    }
    return null;
  }, []);

  const savedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  const isSaved = useCallback((job: GenerationJob, sessionId: string | undefined) => (
    Boolean(sessionId) && savedIds.has(savedAdMatId(
      sessionId as string,
      job.size.width,
      job.size.height,
      job.requestId,
    ))
  ), [savedIds]);

  const toggle = useCallback((job: GenerationJob, source: SourceAsset) => {
    const id = savedAdMatId(source.sessionId, job.size.width, job.size.height, job.requestId);
    const current = parseSavedAdMats(getSnapshot());
    const next = current.some((item) => item.id === id)
      ? current.filter((item) => item.id !== id)
      : [createSavedAdMat(job, source), ...current];
    return replaceItems(next);
  }, [replaceItems]);

  const remove = useCallback((id: string) => {
    const current = parseSavedAdMats(getSnapshot());
    return replaceItems(current.filter((item) => item.id !== id));
  }, [replaceItems]);

  const refreshPreview = useCallback(async (item: SavedAdMat) => {
    const response = await postJson<{ previewUrl: string }>("/api/assets/sign", {
      sessionId: item.sessionId,
      assetToken: item.assetToken,
      asset: {
        requestId: item.requestId,
        width: item.width,
        height: item.height,
      },
    });
    const current = parseSavedAdMats(getSnapshot());
    const next = current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, previewUrl: response.previewUrl } : candidate
    ));
    replaceItems(next);
    return response.previewUrl;
  }, [replaceItems]);

  const updatePreview = useCallback((id: string, previewUrl: string) => {
    const current = parseSavedAdMats(getSnapshot());
    if (!current.some((item) => item.id === id)) return null;
    return replaceItems(current.map((item) => item.id === id ? { ...item, previewUrl } : item));
  }, [replaceItems]);

  const download = useCallback(async (item: SavedAdMat) => {
    const response = await postJson<{ downloadUrl: string; filename: string }>("/api/download", {
      sessionId: item.sessionId,
      assetToken: item.assetToken,
      sourceName: item.sourceName,
      asset: {
        requestId: item.requestId,
        width: item.width,
        height: item.height,
      },
    });
    triggerBrowserDownload(response.downloadUrl, response.filename);
  }, []);

  return { items, isSaved, toggle, remove, refreshPreview, updatePreview, download };
}
