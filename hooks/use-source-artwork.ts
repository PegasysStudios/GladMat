"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api-client";
import type { SourceAnalysis } from "@/lib/schemas";
import { uploadFileToSignedUrl } from "@/lib/signed-upload";
import type { SourceAsset, UploadStatus } from "@/lib/types";
import type { SavedArtwork } from "@/lib/saved-artwork";
import { useSavedArtwork } from "@/hooks/use-saved-artwork";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type PreparedUpload = {
  sessionId: string;
  sessionToken: string;
  originalPath: string;
  signedUrl: string;
};

type AnalysisResponse = { analysis: SourceAnalysis };
type RestoreResponse = { sessionToken: string; previewUrl: string; analysis: SourceAnalysis | null };

async function restoreSavedArtwork(item: SavedArtwork) {
  return postJson<RestoreResponse>("/api/artwork/restore", {
    sessionId: item.source.sessionId,
    sourceToken: item.source.sourceToken,
  });
}

function friendlyClientError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function useSourceArtwork(onReplace?: () => void) {
  const { items: savedArtwork, save: saveArtwork, update: updateSavedArtwork, remove: removeSavedArtwork } = useSavedArtwork();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [source, setSource] = useState<SourceAsset | null>(null);
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [correctedText, setCorrectedTextState] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const persistArtwork = useCallback((asset: SourceAsset, analysis: SourceAnalysis | null, lines: string[], bytes: number | null) => {
    if (!asset.sourceToken) return;
    setStorageError(saveArtwork({
      source: { ...asset, sourceToken: asset.sourceToken },
      analysis,
      correctedText: lines,
      fileSize: bytes,
      savedAt: new Date().toISOString(),
    }));
  }, [saveArtwork]);

  const setCorrectedText = useCallback((lines: string[]) => {
    setCorrectedTextState(lines);
    if (source) persistArtwork(source, analysis, lines, fileSize);
  }, [source, analysis, fileSize, persistArtwork]);

  const analyze = useCallback(async (asset: SourceAsset, version: number, bytes: number | null) => {
    setStatus("analyzing");
    try {
      const response = await postJson<AnalysisResponse>("/api/analyze", {
        sessionId: asset.sessionId,
        sessionToken: asset.sessionToken,
        sourcePath: asset.sourcePath,
      });
      if (version !== versionRef.current) return;
      setAnalysis(response.analysis);
      setCorrectedTextState(response.analysis.exactText);
      persistArtwork(asset, response.analysis, response.analysis.exactText, bytes);
      setStatus("ready");
      setError(null);
    } catch (caught) {
      if (version !== versionRef.current) return;
      setStatus("error");
      setError(friendlyClientError(caught));
    }
  }, [persistArtwork]);

  const upload = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Choose a PNG, JPG, JPEG, or WEBP image.");
      setStatus("error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Artwork must be 20 MB or smaller.");
      setStatus("error");
      return;
    }

    versionRef.current += 1;
    const version = versionRef.current;
    onReplace?.();
    setSource(null);
    setAnalysis(null);
    setCorrectedTextState([]);
    setError(null);
    setStatus("uploading");
    setFileSize(file.size);
    setLocalPreviewUrl(URL.createObjectURL(file));

    try {
      const prepared = await postJson<PreparedUpload>("/api/upload", {
        action: "prepare",
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });
      if (version !== versionRef.current) return;

      await uploadFileToSignedUrl(prepared.signedUrl, file);
      if (version !== versionRef.current) return;

      const completed = await postJson<SourceAsset>("/api/upload", {
        action: "complete",
        sessionId: prepared.sessionId,
        sessionToken: prepared.sessionToken,
        originalPath: prepared.originalPath,
        originalName: file.name,
      });
      if (version !== versionRef.current) return;
      setSource(completed);
      persistArtwork(completed, null, [], file.size);
      await analyze(completed, version, file.size);
    } catch (caught) {
      if (version !== versionRef.current) return;
      setStatus("error");
      setError(friendlyClientError(caught));
    }
  }, [analyze, onReplace, persistArtwork]);

  const retryAnalysis = useCallback(() => {
    if (source) void analyze(source, versionRef.current, fileSize);
  }, [analyze, source, fileSize]);

  const restore = useCallback(async (item: SavedArtwork) => {
    const version = ++versionRef.current;
    const response = await restoreSavedArtwork(item);
    if (version !== versionRef.current) return false;
    onReplace?.();
    const asset = { ...item.source, sessionToken: response.sessionToken, previewUrl: response.previewUrl };
    setSource(asset);
    setLocalPreviewUrl(null);
    setFileSize(item.fileSize);
    setAnalysis(response.analysis);
    const lines = item.analysis ? item.correctedText : response.analysis?.exactText ?? [];
    setCorrectedTextState(lines);
    persistArtwork(asset, response.analysis, lines, item.fileSize);
    setError(null);
    if (response.analysis) {
      setStatus("ready");
    } else {
      await analyze(asset, version, item.fileSize);
    }
    return version === versionRef.current;
  }, [analyze, onReplace, persistArtwork]);

  const refreshSavedPreview = useCallback(async (item: SavedArtwork) => {
    const response = await restoreSavedArtwork(item);
    setStorageError(updateSavedArtwork(item.source.sessionId, (current) => ({
      ...current,
      source: { ...current.source, sessionToken: response.sessionToken, previewUrl: response.previewUrl },
      analysis: response.analysis,
      correctedText: current.analysis ? current.correctedText : response.analysis?.exactText ?? [],
    })));
    return response.previewUrl;
  }, [updateSavedArtwork]);

  return {
    status,
    source,
    analysis,
    correctedText,
    setCorrectedText,
    error,
    localPreviewUrl,
    fileSize,
    upload,
    retryAnalysis,
    restore,
    savedArtwork,
    removeSavedArtwork,
    refreshSavedPreview,
    storageError,
  };
}
