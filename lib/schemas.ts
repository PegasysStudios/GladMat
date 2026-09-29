import { z } from "zod";
import { MAX_FINE_TUNE_SCALE, MIN_FINE_TUNE_SCALE } from "@/lib/fine-tune";

const shortText = z.string().trim().max(500);
const optionalCopy = z.string().trim().max(300);
const detectedCopy = optionalCopy.optional().default("");

export const ColorSchema = z
  .object({
    hex: z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color"),
    role: z.string().trim().min(1).max(120),
  })
  .strict();

export const SourceAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    exactText: z.array(optionalCopy).max(80),
    primaryHeadline: detectedCopy,
    artistOrEventName: detectedCopy,
    dateText: detectedCopy,
    timeText: detectedCopy,
    venueText: detectedCopy,
    locationText: detectedCopy,
    ctaText: detectedCopy,
    websiteText: detectedCopy,
    otherRequiredText: z.array(optionalCopy).max(40).optional().default([]),
    visualStyle: z.string().trim().min(1).max(1500),
    colorPalette: z.array(ColorSchema).max(16),
    typography: z
      .object({
        headlineStyle: shortText,
        bodyStyle: shortText,
        other: shortText,
      })
      .strict(),
    visualHierarchy: z.array(shortText).max(20),
    importantSubjects: z
      .array(
        z
          .object({
            description: shortText,
            importance: z.enum(["primary", "secondary", "supporting"]),
          })
          .strict(),
      )
      .max(20),
    logosAndMarks: z.array(shortText).max(30),
    decorativeElements: z.array(shortText).max(30),
    layoutDescription: z.string().trim().min(1).max(1500),
    preservationInstructions: z.array(shortText).max(30),
  })
  .strict();

export type SourceAnalysis = z.infer<typeof SourceAnalysisSchema>;

export const SessionIdSchema = z.string().uuid();
export const SessionTokenSchema = z.string().regex(/^\d{10,13}\.[a-f0-9]{64}$/i);
export const AssetTokenSchema = z.string().regex(/^\d{10,13}\.[a-f0-9]{64}$/i);
export const RequestIdSchema = z.string().uuid();

export const ImageMimeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

export const PrepareUploadSchema = z
  .object({
    action: z.literal("prepare"),
    filename: z.string().trim().min(1).max(255),
    mimeType: ImageMimeSchema,
    fileSize: z.number().int().positive().max(20 * 1024 * 1024),
  })
  .strict();

export const CompleteUploadSchema = z
  .object({
    action: z.literal("complete"),
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    originalPath: z.string().trim().min(1).max(300),
    originalName: z.string().trim().min(1).max(255),
  })
  .strict();

export const UploadRequestSchema = z.discriminatedUnion("action", [
  PrepareUploadSchema,
  CompleteUploadSchema,
]);

export const AnalyzeRequestSchema = z
  .object({
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    sourcePath: z.string().trim().min(1).max(300),
  })
  .strict();

export const DimensionPairSchema = z
  .object({
    width: z.number().int().min(64).max(4000),
    height: z.number().int().min(50).max(4000),
  })
  .strict()
  .superRefine(({ width, height }, context) => {
    if (width * height > 8_000_000) {
      context.addIssue({ code: "custom", message: "Dimensions cannot exceed 8 megapixels" });
    }
    const ratio = Math.max(width / height, height / width);
    if (ratio > 12) {
      context.addIssue({ code: "custom", message: "Aspect ratio cannot exceed 12:1" });
    }
  });

export const GenerateRequestSchema = z
  .object({
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    sourcePath: z.string().trim().min(1).max(300),
    requestId: RequestIdSchema,
    width: z.number().int().min(64).max(4000),
    height: z.number().int().min(50).max(4000),
    formatName: z.string().trim().min(1).max(80),
    correctedText: z.array(optionalCopy).max(80),
    additionalInstructions: z.string().trim().max(1500),
    regenerationInstructions: z.string().trim().min(1).max(1500).optional(),
  })
  .strict()
  .superRefine(({ width, height }, context) => {
    if (width * height > 8_000_000) {
      context.addIssue({ code: "custom", message: "Dimensions cannot exceed 8 megapixels" });
    }
    if (Math.max(width / height, height / width) > 12) {
      context.addIssue({ code: "custom", message: "Aspect ratio cannot exceed 12:1" });
    }
  });

export const AssetIdentitySchema = z
  .object({
    requestId: RequestIdSchema,
    width: z.number().int().min(64).max(4000),
    height: z.number().int().min(50).max(4000),
  })
  .strict()
  .superRefine(({ width, height }, context) => {
    if (width * height > 8_000_000) {
      context.addIssue({ code: "custom", message: "Dimensions cannot exceed 8 megapixels" });
    }
    if (Math.max(width / height, height / width) > 12) {
      context.addIssue({ code: "custom", message: "Aspect ratio cannot exceed 12:1" });
    }
  });

const SessionAssetAccessSchema = z
  .object({
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    asset: AssetIdentitySchema,
  })
  .strict();

const SavedAssetAccessSchema = z
  .object({
    sessionId: SessionIdSchema,
    assetToken: AssetTokenSchema,
    asset: AssetIdentitySchema,
  })
  .strict();

export const SignAssetRequestSchema = z.union([
  SessionAssetAccessSchema,
  SavedAssetAccessSchema,
]);

export const FineTuneTransformSchema = z.object({
  scale: z.number().min(MIN_FINE_TUNE_SCALE).max(MAX_FINE_TUNE_SCALE),
  offsetX: z.number().min(-1).max(1),
  offsetY: z.number().min(-1).max(1),
}).strict();

export const SaveFineTuneRequestSchema = z.union([
  SessionAssetAccessSchema.extend({ transform: FineTuneTransformSchema }),
  SavedAssetAccessSchema.extend({ transform: FineTuneTransformSchema }),
]);

export const DownloadAssetRequestSchema = z.union([
  z
    .object({
      sessionId: SessionIdSchema,
      sessionToken: SessionTokenSchema,
      sourceName: z.string().trim().min(1).max(120),
      asset: AssetIdentitySchema,
    })
    .strict(),
  z
    .object({
      sessionId: SessionIdSchema,
      assetToken: AssetTokenSchema,
      sourceName: z.string().trim().min(1).max(120),
      asset: AssetIdentitySchema,
    })
    .strict(),
]);

export const DownloadZipRequestSchema = z
  .object({
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    sourceName: z.string().trim().min(1).max(120),
    assets: z.array(AssetIdentitySchema).min(1).max(30),
  })
  .strict();

export const QualityValidationSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict();

export type QualityValidation = z.infer<typeof QualityValidationSchema>;
