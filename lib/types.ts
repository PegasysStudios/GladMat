export type AdSize = {
  id: string;
  name: string;
  width: number;
  height: number;
  custom?: boolean;
};

export type GenerationStatus =
  | "queued"
  | "generating"
  | "processing"
  | "complete"
  | "error";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "analyzing"
  | "ready"
  | "error";

export type SourceAsset = {
  sessionId: string;
  sessionToken: string;
  sourcePath: string;
  originalName: string;
  sourceName: string;
  width: number;
  height: number;
  previewUrl: string;
};

export type GenerationJob = {
  size: AdSize;
  status: GenerationStatus;
  requestId: string;
  previewUrl?: string;
  error?: string;
  needsReview?: boolean;
  validationIssues?: string[];
  attempts?: number;
};
