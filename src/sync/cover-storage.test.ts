import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  createCoverStoragePath,
  deleteCover,
  downloadCover,
  parseCoverStoragePath,
  uploadCover,
} from "@/sync/cover-storage";

const userId = "90000000-0000-4000-8000-000000000000";
const bookId = "10000000-0000-4000-8000-000000000000";
const imageId = "30000000-0000-4000-8000-000000000000";

describe("private cover paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("génère un chemin stable sous le dossier utilisateur", () => {
    expect(createCoverStoragePath(userId, bookId, imageId)).toBe(
      `${userId}/${bookId}/${imageId}.jpg`,
    );
  });

  it("retrouve l’image dans un chemin autorisé", () => {
    expect(
      parseCoverStoragePath(
        `${userId}/${bookId}/${imageId}.webp`,
        userId,
        bookId,
      ),
    ).toBe(imageId);
  });

  it("refuse le dossier d’un autre utilisateur ou livre", () => {
    expect(() =>
      parseCoverStoragePath(
        `80000000-0000-4000-8000-000000000000/${bookId}/${imageId}.jpg`,
        userId,
        bookId,
      ),
    ).toThrow("chemin");
    expect(() =>
      parseCoverStoragePath(
        `${userId}/40000000-0000-4000-8000-000000000000/${imageId}.jpg`,
        userId,
        bookId,
      ),
    ).toThrow("chemin");
  });

  it("upload le Blob sans Base64 et supprime le fichier privé", async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const client = {
      storage: { from: () => ({ upload, remove }) },
    } as unknown as SupabaseClient<Database>;
    const blob = new Blob(["cover"], { type: "image/jpeg" });
    const path = createCoverStoragePath(userId, bookId, imageId);

    await uploadCover(client, path, {
      id: imageId,
      blob,
      mimeType: "image/jpeg",
      width: 600,
      height: 900,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await deleteCover(client, path);

    expect(upload).toHaveBeenCalledWith(
      path,
      blob,
      expect.objectContaining({ upsert: true, contentType: "image/jpeg" }),
    );
    expect(remove).toHaveBeenCalledWith([path]);
  });

  it("télécharge et valide une couverture privée", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 600, height: 900, close })),
    );
    const blob = new Blob(["cover"], { type: "image/jpeg" });
    const client = {
      storage: {
        from: () => ({
          download: async () => ({ data: blob, error: null }),
        }),
      },
    } as unknown as SupabaseClient<Database>;

    await expect(
      downloadCover(
        client,
        createCoverStoragePath(userId, bookId, imageId),
        imageId,
        "2026-01-01T00:00:00.000Z",
      ),
    ).resolves.toMatchObject({
      id: imageId,
      blob,
      width: 600,
      height: 900,
    });
    expect(close).toHaveBeenCalled();
  });

  it("conserve l’erreur lorsque l’upload ou le fichier distant échoue", async () => {
    const uploadError = new Error("Storage indisponible");
    const client = {
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: uploadError }),
          download: async () => ({
            data: null,
            error: new Error("Object not found"),
          }),
        }),
      },
    } as unknown as SupabaseClient<Database>;
    const path = createCoverStoragePath(userId, bookId, imageId);

    await expect(
      uploadCover(client, path, {
        id: imageId,
        blob: new Blob(["cover"], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        width: 600,
        height: 900,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toBe(uploadError);
    await expect(
      downloadCover(
        client,
        path,
        imageId,
        "2026-01-01T00:00:00.000Z",
      ),
    ).rejects.toThrow("Object not found");
  });
});
