import type { OcrImageMode } from "@/domain/ocr-types";

export interface ImagePoint {
  x: number;
  y: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PageCorners {
  topLeft: NormalizedPoint;
  topRight: NormalizedPoint;
  bottomRight: NormalizedPoint;
  bottomLeft: NormalizedPoint;
}

export type PageCornerName = keyof PageCorners;

export interface PageCandidateScore {
  area: number;
  angles: number;
  center: number;
  edges: number;
  shape: number;
}

export interface PageDetectionCandidate {
  corners: PageCorners;
  confidence: number;
  areaRatio: number;
  isConvex: boolean;
  score: number;
  criteria: PageCandidateScore;
}

export interface PhotographWarning {
  code:
    | "dark"
    | "bright"
    | "lowContrast"
    | "smallPage"
    | "strongPerspective";
  message: string;
}

export interface PageDetectionResult {
  status: "detected" | "uncertain" | "notDetected";
  corners?: PageCorners;
  candidates?: PageDetectionCandidate[];
  processingWidth: number;
  processingHeight: number;
  durationMs?: number;
  warning?: string;
  photographWarnings: PhotographWarning[];
}

export interface PerspectiveResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  sourceCorners: PageCorners;
  wasAutomaticallyDetected: boolean;
  processingDurationMs?: number;
  mode: OcrImageMode;
}

export interface PageGeometryValidation {
  valid: boolean;
  errors: string[];
  areaRatio: number;
}

export interface PerspectiveDimensions {
  width: number;
  height: number;
  scale: number;
  wasLimited: boolean;
}

export type OpenCvLoaderState = "idle" | "loading" | "ready" | "error";
