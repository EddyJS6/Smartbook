import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredImage, UUID } from "@/domain/models";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid, RemoteDataValidationError } from "@/sync/mapping";

export const COVER_BUCKET = "book-covers";

export function createCoverStoragePath(
  userId: UUID,
  bookId: UUID,
  imageId: UUID,
): string {
  return `${userId}/${bookId}/${imageId}.jpg`;
}

export function parseCoverStoragePath(
  path: string,
  expectedUserId: UUID,
  expectedBookId: UUID,
): UUID {
  const parts = path.split("/");
  const imagePart = parts[2] ?? "";
  const imageId = imagePart.replace(/\.(?:jpe?g|png|webp)$/i, "");
  if (
    parts.length !== 3 ||
    parts[0] !== expectedUserId ||
    parts[1] !== expectedBookId ||
    !isUuid(imageId)
  ) {
    throw new RemoteDataValidationError(
      "Le chemin d’une couverture distante est invalide.",
    );
  }
  return imageId;
}

async function getBlobDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  if ("createImageBitmap" in globalThis) {
    const bitmap = await createImageBitmap(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("La couverture distante ne peut pas être décodée."));
    };
    image.src = url;
  });
}

export async function uploadCover(
  client: SupabaseClient<Database>,
  path: string,
  image: StoredImage,
): Promise<void> {
  const { error } = await client.storage.from(COVER_BUCKET).upload(
    path,
    image.blob,
    {
      contentType: image.mimeType,
      cacheControl: "3600",
      upsert: true,
    },
  );
  if (error) throw error;
}

export async function downloadCover(
  client: SupabaseClient<Database>,
  path: string,
  imageId: UUID,
  createdAt: string,
): Promise<StoredImage> {
  const { data, error } = await client.storage.from(COVER_BUCKET).download(path);
  if (error) throw error;
  if (!data || !data.type.startsWith("image/")) {
    throw new RemoteDataValidationError(
      "La couverture distante est absente ou corrompue.",
    );
  }
  const dimensions = await getBlobDimensions(data);
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new RemoteDataValidationError(
      "Les dimensions de la couverture distante sont invalides.",
    );
  }
  return {
    id: imageId,
    blob: data,
    mimeType: data.type,
    width: dimensions.width,
    height: dimensions.height,
    createdAt,
  };
}

export async function deleteCover(
  client: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  const { error } = await client.storage.from(COVER_BUCKET).remove([path]);
  if (error) throw error;
}
