export const OCR_LANGUAGES = [
  { code: "fra", label: "Français" },
  { code: "eng", label: "Anglais" },
  { code: "pol", label: "Polonais" },
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]["code"];

export type OcrImageMode = "original" | "grayscale" | "enhanced";

export interface OcrBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  id: string;
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
  wordIndex: number;
  order: number;
}

export interface OcrLine {
  id: string;
  words: OcrWord[];
  text: string;
  bbox: OcrBoundingBox;
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
  order: number;
}

export interface OcrResult {
  fullText: string;
  words: OcrWord[];
  lines: OcrLine[];
  imageWidth: number;
  imageHeight: number;
  meanConfidence: number;
  language: OcrLanguage;
  processingDurationMs?: number;
}

export interface OcrSelectionRange {
  startOrder: number;
  endOrder: number;
}

export type ScanStage =
  | "idle"
  | "preparingImage"
  | "adjustingPage"
  | "rectifyingPage"
  | "pagePreview"
  | "readyForOcr"
  | "loadingOcrEngine"
  | "recognizing"
  | "selection"
  | "review"
  | "error";

export interface OcrProgress {
  phase:
    | "engine"
    | "language"
    | "recognition"
    | "organization";
  label: string;
  progress: number | null;
}
