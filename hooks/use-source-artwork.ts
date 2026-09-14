"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api-client";
import type { SourceAnalysis } from "@/lib/schemas";
import { uploadFileToSignedUrl } from "@/lib/signed-upload";
import type { SourceAsset, UploadStatus } from "@/lib/types";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type PreparedUpload = {
  sessionId: string;
  sessionToken: string;
  originalPath: string;
  signedUrl: string;
};

type AnalysisResponse = { analysis: SourceAnalysis };

function friendlyClientError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function useSourceArtwork(onReplace?: () => void) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [source, setSource] = useState<SourceAsset | null>(null);
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [correctedText, setCorrectedText] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const analyze = useCallback(async (asset: SourceAsset, version: number) => {
    setStatus("analyzing");
    try {
      const response = await postJson<AnalysisResponse>("/api/analyze", {
        sessionId: asset.sessionId,
        sessionToken: asset.sessionToken,
        sourcePath: asset.sourcePath,
      });
      if (version !== versionRef.current) return;
      setAnalysis(response.analysis);
      setCorrectedText(response.analysis.exactText);
      setStatus("ready");
      setError(null);
    } catch (caught) {
      if (version !== versionRef.current) return;
      setStatus("error");
      setError(friendlyClientError(caught));
    }
  }, []);

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
    setCorrectedText([]);
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
      await analyze(completed, version);
    } catch (caught) {
      if (version !== versionRef.current) return;
      setStatus("error");
      setError(friendlyClientError(caught));
    }
  }, [analyze, onReplace]);

  const retryAnalysis = useCallback(() => {
    if (source) void analyze(source, versionRef.current);
  }, [analyze, source]);

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
  };
}
