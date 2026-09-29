"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseSavedArtwork, SAVED_ARTWORK_STORAGE_KEY, serializeSavedArtwork, type SavedArtwork } from "@/lib/saved-artwork";

const subscribers = new Set<() => void>();

function getSnapshot() {
  try { return localStorage.getItem(SAVED_ARTWORK_STORAGE_KEY); } catch { return null; }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_ARTWORK_STORAGE_KEY || event.key === null) onChange();
  };
  subscribers.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    subscribers.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function replace(items: SavedArtwork[]) {
  try {
    if (items.length) localStorage.setItem(SAVED_ARTWORK_STORAGE_KEY, serializeSavedArtwork(items));
    else localStorage.removeItem(SAVED_ARTWORK_STORAGE_KEY);
    for (const subscriber of subscribers) subscriber();
    return null;
  } catch {
    return "Your browser could not save the artwork library. Allow local storage or free some browser storage and try again.";
  }
}

export function useSavedArtwork() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const items = useMemo(() => parseSavedArtwork(stored), [stored]);
  const save = useCallback((item: SavedArtwork) => replace([
    item,
    ...parseSavedArtwork(getSnapshot()).filter((current) => current.source.sessionId !== item.source.sessionId),
  ]), []);
  const remove = useCallback((sessionId: string) => replace(
    parseSavedArtwork(getSnapshot()).filter((item) => item.source.sessionId !== sessionId),
  ), []);
  const update = useCallback((sessionId: string, apply: (item: SavedArtwork) => SavedArtwork) => {
    const current = parseSavedArtwork(getSnapshot());
    if (!current.some((item) => item.source.sessionId === sessionId)) return null;
    return replace(current.map((item) => item.source.sessionId === sessionId ? apply(item) : item));
  }, []);
  return { items, save, remove, update };
}
