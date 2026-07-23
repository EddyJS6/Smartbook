import type { PreparedImage } from "@/domain/models";
import { BrainBookStorageError } from "@/storage/errors";

const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_SIDE = 1_200;
const OUTPUT_QUALITY = 0.84;

type DrawableImage = ImageBitmap | HTMLImageElement;

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new BrainBookStorageError(
          "invalid_image",
          "Ce format d’image ne peut pas être lu sur cet appareil.",
        ),
      );
    };
    image.src = url;
  });
}

async function decodeImage(file: File): Promise<DrawableImage> {
  if ("createImageBitmap" in globalThis) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Le secours HTMLImageElement gère certains formats Safari différemment.
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
          new BrainBookStorageError(
            "invalid_image",
            "La couverture n’a pas pu être préparée. Essayez une autre image.",
          ),
        );
      },
      "image/jpeg",
      OUTPUT_QUALITY,
    );
  });
}

export async function processCoverImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new BrainBookStorageError(
      "invalid_image",
      "Le fichier choisi n’est pas une image.",
    );
  }

  if (file.size === 0) {
    throw new BrainBookStorageError(
      "invalid_image",
      "L’image choisie est vide ou invalide.",
    );
  }

  if (file.size > MAX_SOURCE_SIZE) {
    throw new BrainBookStorageError(
      "invalid_image",
      "Cette image est trop volumineuse. Choisissez un fichier de moins de 15 Mo.",
    );
  }

  const source = await decodeImage(file);

  try {
    const sourceWidth = source.width;
    const sourceHeight = source.height;

    if (
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      sourceWidth * sourceHeight > MAX_SOURCE_PIXELS
    ) {
      throw new BrainBookStorageError(
        "invalid_image",
        "Les dimensions de cette image sont invalides ou trop importantes.",
      );
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new BrainBookStorageError(
        "invalid_image",
        "Le navigateur ne peut pas préparer cette couverture.",
      );
    }

    context.fillStyle = "#fffdf9";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);

    return {
      blob,
      mimeType: blob.type || "image/jpeg",
      width,
      height,
    };
  } finally {
    if ("close" in source && typeof source.close === "function") {
      source.close();
    }
  }
}
