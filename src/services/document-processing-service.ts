"use client";

import {
  calculatePerspectiveDimensions,
  normalizedCornersFromImagePoints,
  normalizedPointToImage,
  pageCornersToArray,
  scorePageQuadrilateral,
  validatePageCorners,
} from "@/domain/document-geometry";
import type {
  ImagePoint,
  PageCorners,
  PageDetectionCandidate,
  PageDetectionResult,
  PerspectiveResult,
  PhotographWarning,
} from "@/domain/document-types";
import type { OcrImageMode } from "@/domain/ocr-types";
import {
  detectPageInWorker,
  rectifyPageInWorker,
} from "@/services/opencv-worker-client";

export const DOCUMENT_DETECTION_MAX_SIDE = 1_000;
const PERSPECTIVE_JPEG_QUALITY = 0.92;
const DETECTED_SCORE = 0.66;
const UNCERTAIN_SCORE = 0.42;
const MAX_REPORTED_CANDIDATES = 5;

type DrawableImage = ImageBitmap | HTMLImageElement;

export type DocumentProcessingErrorCode =
  | "cancelled"
  | "decode"
  | "canvas"
  | "opencv"
  | "geometry"
  | "empty"
  | "memory";

export class DocumentProcessingError extends Error {
  constructor(
    readonly code: DocumentProcessingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DocumentProcessingError";
  }
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DocumentProcessingError(
      "cancelled",
      "Le traitement de la page a été annulé.",
    );
  }
}

function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new DocumentProcessingError(
          "decode",
          "Cette image ne peut pas être décodée sur cet appareil.",
        ),
      );
    };
    image.src = url;
  });
}

async function decodeImage(blob: Blob): Promise<DrawableImage> {
  if ("createImageBitmap" in globalThis) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Le secours HTML couvre des versions de Safari plus anciennes.
    }
  }
  return loadHtmlImage(blob);
}

function closeDrawable(source: DrawableImage): void {
  if ("close" in source && typeof source.close === "function") source.close();
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else {
          reject(
            new DocumentProcessingError(
              "empty",
              "Le résultat redressé est vide. Ajustez les coins puis réessayez.",
            ),
          );
        }
      },
      "image/jpeg",
      PERSPECTIVE_JPEG_QUALITY,
    );
  });
}

async function drawReducedSource(
  blob: Blob,
  maxSide: number,
): Promise<HTMLCanvasElement> {
  const source = await decodeImage(blob);
  try {
    if (source.width <= 0 || source.height <= 0) {
      throw new DocumentProcessingError(
        "decode",
        "Les dimensions de cette image sont invalides.",
      );
    }
    const scale = Math.min(
      1,
      maxSide / Math.max(source.width, source.height),
    );
    const canvas = createCanvas(source.width * scale, source.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      releaseCanvas(canvas);
      throw new DocumentProcessingError(
        "canvas",
        "Ce navigateur ne permet pas de préparer la page.",
      );
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    closeDrawable(source);
  }
}

function canvasBuffer(canvas: HTMLCanvasElement): ArrayBuffer {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new DocumentProcessingError(
      "canvas",
      "Le buffer de la page n’a pas pu être créé.",
    );
  }
  return context.getImageData(0, 0, canvas.width, canvas.height).data
    .buffer as ArrayBuffer;
}

function addPhotographWarnings(
  mean: number,
  standardDeviation: number,
  candidate: PageDetectionCandidate | undefined,
): PhotographWarning[] {
  const warnings: PhotographWarning[] = [];
  if (mean < 62) {
    warnings.push({
      code: "dark",
      message:
        "La photo semble sombre. La reconnaissance pourrait être moins précise.",
    });
  } else if (mean > 224) {
    warnings.push({
      code: "bright",
      message:
        "La photo semble très claire. Vérifiez que le texte reste bien visible.",
    });
  }
  if (standardDeviation < 27) {
    warnings.push({
      code: "lowContrast",
      message:
        "Le contraste global semble faible. Essayez le mode Contraste renforcé.",
    });
  }
  if (candidate && candidate.areaRatio < 0.34) {
    warnings.push({
      code: "smallPage",
      message:
        "La page occupe peu de place dans l’image. Rapprochez l’appareil si possible.",
    });
  }
  if (candidate && candidate.criteria.angles < 0.52) {
    warnings.push({
      code: "strongPerspective",
      message:
        "L’angle de prise de vue est important. Vérifiez soigneusement les quatre coins.",
    });
  }
  return warnings;
}

function deduplicateCandidates(
  candidates: readonly PageDetectionCandidate[],
): PageDetectionCandidate[] {
  const unique: PageDetectionCandidate[] = [];
  for (const candidate of [...candidates].sort(
    (left, right) => right.score - left.score,
  )) {
    const points = pageCornersToArray(candidate.corners);
    const duplicate = unique.some((existing) => {
      const existingPoints = pageCornersToArray(existing.corners);
      return (
        points.reduce(
          (sum, point, index) =>
            sum +
            Math.hypot(
              point.x - existingPoints[index].x,
              point.y - existingPoints[index].y,
            ),
          0,
        ) /
          4 <
        0.035
      );
    });
    if (!duplicate) unique.push(candidate);
  }
  return unique.slice(0, MAX_REPORTED_CANDIDATES);
}

export async function detectPage(
  image: Blob,
  signal?: AbortSignal,
): Promise<PageDetectionResult> {
  const startedAt = performance.now();
  throwIfCancelled(signal);
  const canvas = await drawReducedSource(image, DOCUMENT_DETECTION_MAX_SIDE);
  try {
    const raw = await detectPageInWorker(
      {
        buffer: canvasBuffer(canvas),
        width: canvas.width,
        height: canvas.height,
      },
      signal,
    );
    throwIfCancelled(signal);
    const candidates = deduplicateCandidates(
      raw.candidates
        .map((points) =>
          normalizedCornersFromImagePoints(
            points,
            canvas.width,
            canvas.height,
          ),
        )
        .filter((corners): corners is PageCorners => corners !== null)
        .map(scorePageQuadrilateral),
    );
    const best = candidates[0];
    const status =
      best && best.score >= DETECTED_SCORE
        ? "detected"
        : best && best.score >= UNCERTAIN_SCORE
          ? "uncertain"
          : "notDetected";
    return {
      status,
      ...(status !== "notDetected" && best ? { corners: best.corners } : {}),
      candidates:
        process.env.NODE_ENV === "development" ? candidates : undefined,
      processingWidth: canvas.width,
      processingHeight: canvas.height,
      durationMs: Math.round(performance.now() - startedAt),
      warning:
        status === "detected"
          ? "La page a été détectée. Vérifiez les quatre coins avant de continuer."
          : status === "uncertain"
            ? "La page a été approximativement détectée. Ajustez les coins si nécessaire."
            : "Les limites de la page n’ont pas été trouvées automatiquement. Placez les quatre coins manuellement.",
      photographWarnings: addPhotographWarnings(
        raw.mean,
        raw.standardDeviation,
        best,
      ),
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new DocumentProcessingError(
        "cancelled",
        "Le traitement de la page a été annulé.",
      );
    }
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError(
      "opencv",
      "La détection automatique a échoué. Vous pouvez placer les coins manuellement.",
      { cause: error },
    );
  } finally {
    releaseCanvas(canvas);
  }
}

export async function rectifyPage(
  image: Blob,
  sourceCorners: PageCorners,
  options: {
    mode: OcrImageMode;
    wasAutomaticallyDetected: boolean;
    signal?: AbortSignal;
  },
): Promise<PerspectiveResult> {
  const startedAt = performance.now();
  const validation = validatePageCorners(sourceCorners);
  if (!validation.valid) {
    throw new DocumentProcessingError(
      "geometry",
      validation.errors[0] ??
        "Les quatre coins ne forment pas une page valide.",
    );
  }
  throwIfCancelled(options.signal);
  const canvas = await drawReducedSource(image, 2_600);
  const dimensions = calculatePerspectiveDimensions(
    sourceCorners,
    canvas.width,
    canvas.height,
  );
  const outputCanvas = createCanvas(dimensions.width, dimensions.height);
  try {
    const sourcePoints: ImagePoint[] = pageCornersToArray(sourceCorners).map(
      (point) => normalizedPointToImage(point, canvas.width, canvas.height),
    );
    const output = await rectifyPageInWorker(
      {
        buffer: canvasBuffer(canvas),
        width: canvas.width,
        height: canvas.height,
        outputWidth: dimensions.width,
        outputHeight: dimensions.height,
        sourcePoints,
        mode: options.mode,
      },
      options.signal,
    );
    throwIfCancelled(options.signal);
    const context = outputCanvas.getContext("2d");
    if (!context) {
      throw new DocumentProcessingError(
        "canvas",
        "Le résultat redressé ne peut pas être affiché.",
      );
    }
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(output.buffer),
        dimensions.width,
        dimensions.height,
      ),
      0,
      0,
    );
    const blob = await canvasToBlob(outputCanvas);
    return {
      blob,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: blob.type || "image/jpeg",
      sourceCorners,
      wasAutomaticallyDetected: options.wasAutomaticallyDetected,
      processingDurationMs: Math.round(performance.now() - startedAt),
      mode: options.mode,
    };
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new DocumentProcessingError(
        "cancelled",
        "Le traitement de la page a été annulé.",
      );
    }
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError(
      "memory",
      "La page n’a pas pu être redressée. Réessayez avec une zone plus petite ou continuez sans redresser.",
      { cause: error },
    );
  } finally {
    releaseCanvas(outputCanvas);
    releaseCanvas(canvas);
  }
}
