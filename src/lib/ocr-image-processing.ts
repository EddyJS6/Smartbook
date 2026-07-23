import type { OcrImageMode } from "@/domain/ocr-types";

const MAX_PAGE_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_PAGE_SOURCE_PIXELS = 60_000_000;
const MIN_PAGE_SIDE = 320;
export const OCR_MAX_IMAGE_SIDE = 2_400;
const OCR_JPEG_QUALITY = 0.9;

type DrawableImage = ImageBitmap | HTMLImageElement;

export type PreparedOcrImage = {
  blob: Blob;
  width: number;
  height: number;
  rotation: number;
  mode: OcrImageMode;
};

export type OcrImageErrorCode =
  | "missing_file"
  | "invalid_type"
  | "too_large"
  | "decode_failed"
  | "too_small"
  | "dimensions"
  | "canvas"
  | "memory";

export class OcrImageError extends Error {
  constructor(
    readonly code: OcrImageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OcrImageError";
  }
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new OcrImageError(
          "decode_failed",
          "Cette image ne peut pas être décodée sur cet appareil. Reprenez une photo ou choisissez une image JPEG.",
        ),
      );
    };
    image.src = objectUrl;
  });
}

async function decodePageImage(file: File): Promise<DrawableImage> {
  if ("createImageBitmap" in globalThis) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Le secours HTMLImageElement couvre certains formats Safari.
    }
  }

  return loadHtmlImage(file);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(
          new OcrImageError(
            "canvas",
            "L’image n’a pas pu être préparée. Reprenez une photo en cadrant uniquement la page.",
          ),
        );
      },
      "image/jpeg",
      OCR_JPEG_QUALITY,
    );
  });
}

export function normalizeRightAngle(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.round(normalized / 90) * 90 % 360;
}

export function calculateOcrDimensions(
  sourceWidth: number,
  sourceHeight: number,
  rotation: number,
): { width: number; height: number; scale: number } {
  const normalizedRotation = normalizeRightAngle(rotation);
  const rotated =
    normalizedRotation === 90 || normalizedRotation === 270
      ? { width: sourceHeight, height: sourceWidth }
      : { width: sourceWidth, height: sourceHeight };
  const scale = Math.min(
    1,
    OCR_MAX_IMAGE_SIDE / Math.max(rotated.width, rotated.height),
  );

  return {
    width: Math.max(1, Math.round(rotated.width * scale)),
    height: Math.max(1, Math.round(rotated.height * scale)),
    scale,
  };
}

function enhanceContrast(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch (error) {
    throw new OcrImageError(
      "memory",
      "La mémoire disponible ne permet pas d’améliorer cette image. Essayez le mode Original ou reprenez une photo plus rapprochée.",
      { cause: error },
    );
  }

  const pixels = imageData.data;
  const contrast = 1.22;
  const brightness = 8;

  for (let index = 0; index < pixels.length; index += 4) {
    const grey =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;
    const adjusted = Math.max(
      0,
      Math.min(255, (grey - 128) * contrast + 128 + brightness),
    );
    pixels[index] = adjusted;
    pixels[index + 1] = adjusted;
    pixels[index + 2] = adjusted;
  }

  context.putImageData(imageData, 0, 0);
}

export async function prepareOcrImage(
  file: File | null | undefined,
  rotation: number,
  mode: OcrImageMode,
): Promise<PreparedOcrImage> {
  if (!file) {
    throw new OcrImageError(
      "missing_file",
      "Aucune image n’a été choisie.",
    );
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new OcrImageError(
      "invalid_type",
      "Le fichier choisi n’est pas une image reconnue.",
    );
  }
  if (file.size === 0) {
    throw new OcrImageError(
      "decode_failed",
      "L’image choisie est vide ou invalide.",
    );
  }
  if (file.size > MAX_PAGE_IMAGE_SIZE) {
    throw new OcrImageError(
      "too_large",
      "Cette image dépasse 20 Mo. Photographiez uniquement la page ou choisissez une image plus légère.",
    );
  }

  let source: DrawableImage;
  try {
    source = await decodePageImage(file);
  } catch (error) {
    if (error instanceof OcrImageError) throw error;
    throw new OcrImageError(
      "decode_failed",
      "Cette image ne peut pas être décodée. Reprenez une photo ou utilisez une image JPEG.",
      { cause: error },
    );
  }

  try {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    if (
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      sourceWidth * sourceHeight > MAX_PAGE_SOURCE_PIXELS
    ) {
      throw new OcrImageError(
        "dimensions",
        "Les dimensions de cette photo sont invalides ou trop importantes. Photographiez uniquement la page.",
      );
    }
    if (Math.min(sourceWidth, sourceHeight) < MIN_PAGE_SIDE) {
      throw new OcrImageError(
        "too_small",
        "Cette image est trop petite pour lire correctement le texte. Reprenez une photo plus nette et plus proche.",
      );
    }

    const normalizedRotation = normalizeRightAngle(rotation);
    const { width, height, scale } = calculateOcrDimensions(
      sourceWidth,
      sourceHeight,
      normalizedRotation,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      willReadFrequently: mode === "enhanced",
    });
    if (!context) {
      throw new OcrImageError(
        "canvas",
        "Ce navigateur ne permet pas de préparer l’image pour la reconnaissance.",
      );
    }

    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.save();

    if (normalizedRotation === 90) {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(width, height);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, height);
      context.rotate(-Math.PI / 2);
    }

    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(source, 0, 0, drawWidth, drawHeight);
    context.restore();

    if (mode === "enhanced") {
      enhanceContrast(context, width, height);
    }

    const blob = await canvasToBlob(canvas);
    canvas.width = 1;
    canvas.height = 1;

    return {
      blob,
      width,
      height,
      rotation: normalizedRotation,
      mode,
    };
  } catch (error) {
    if (error instanceof OcrImageError) throw error;
    throw new OcrImageError(
      "memory",
      "La photo n’a pas pu être traitée, probablement faute de mémoire. Reprenez une photo en cadrant uniquement la page.",
      { cause: error },
    );
  } finally {
    if ("close" in source && typeof source.close === "function") {
      source.close();
    }
  }
}
