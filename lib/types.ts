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
  sourceToken?: string;
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
  assetToken?: string;
  previewUrl?: string;
  error?: string;
  needsReview?: boolean;
  validationIssues?: string[];
  attempts?: number;
  fineTuneAvailable?: boolean;
};

export type SavedAdMat = {
  id: string;
  sessionId: string;
  assetToken: string;
  requestId: string;
  width: number;
  height: number;
  formatName: string;
  sourceName: string;
  sourceOriginalName: string;
  previewUrl?: string;
  needsReview: boolean;
  validationIssues: string[];
  savedAt: string;
  fineTuneAvailable?: boolean;
};
