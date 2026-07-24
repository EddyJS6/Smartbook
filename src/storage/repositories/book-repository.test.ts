import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PreparedImage } from "@/domain/models";
import { BrainBookDatabase } from "@/storage/database";
import { BookRepository } from "@/storage/repositories/book-repository";
import { NoteRepository } from "@/storage/repositories/note-repository";

describe("BookRepository", () => {
  let database: BrainBookDatabase;
  let repository: BookRepository;

  beforeEach(() => {
    database = new BrainBookDatabase(`brainbook-test-${crypto.randomUUID()}`);
    repository = new BookRepository(database);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  const image: PreparedImage = {
    blob: new Blob(["cover"], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    width: 600,
    height: 900,
  };

  it("crée et relit un livre avec sa couverture séparée", async () => {
    const created = await repository.create(
      {
        title: "  Le livre test  ",
        author: "  Ada Lovelace ",
        status: "to_read",
      },
      image,
    );

    expect(created.title).toBe("Le livre test");
    expect(created.author).toBe("Ada Lovelace");
    expect(created.coverImageId).not.toBeNull();
    expect(await database.books.count()).toBe(1);
    expect(await database.images.count()).toBe(1);
    expect(await repository.get(created.id)).toEqual(created);
    expect(await database.syncQueue.get(`book:${created.id}`)).toMatchObject({
      operation: "upsert",
      status: "pending",
    });
    expect(
      created.coverImageId &&
        (await database.syncQueue.get(`coverImage:${created.coverImageId}`)),
    ).toMatchObject({ operation: "upsert", parentId: created.id });
  });

  it("modifie un livre sans modifier sa date de création", async () => {
    const created = await repository.create({
      title: "Titre initial",
      author: "Auteur initial",
      status: "to_read",
    });

    const updated = await repository.update(created.id, {
      title: "Titre modifié",
      author: "Auteur initial",
      status: "finished",
    });

    expect(updated?.title).toBe("Titre modifié");
    expect(updated?.status).toBe("finished");
    expect(updated?.createdAt).toBe(created.createdAt);
  });

  it("crée une vidéo YouTube sans Blob de couverture", async () => {
    const created = await repository.createVideo({
      title: "  Une vidéo utile ",
      author: "  Ada Lovelace ",
      youtubeUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      youtubeVideoId: "M7lc1UVf-VE",
      thumbnailUrl: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    });

    expect(created).toMatchObject({
      contentType: "video",
      title: "Une vidéo utile",
      author: "Ada Lovelace",
      coverImageId: null,
      status: "to_read",
    });
    expect(await database.images.count()).toBe(0);
    expect(await database.syncQueue.get(`book:${created.id}`)).toMatchObject({
      operation: "upsert",
    });
  });

  it("refuse une vidéo dont le lien et l’identifiant ne correspondent pas", async () => {
    await expect(
      repository.createVideo({
        title: "Vidéo",
        author: "Autrice",
        youtubeUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
        youtubeVideoId: "aaaaaaaaaaa",
        thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(await database.books.count()).toBe(0);
  });

  it("remplace une couverture sans laisser l’ancienne image", async () => {
    const created = await repository.create(
      {
        title: "Livre illustré",
        author: "Une autrice",
        status: "reading",
      },
      image,
    );
    const oldImageId = created.coverImageId;

    const updated = await repository.update(
      created.id,
      {
        title: created.title,
        author: created.author,
        status: created.status,
      },
      {
        kind: "replace",
        image: {
          ...image,
          blob: new Blob(["replacement"], { type: "image/jpeg" }),
        },
      },
    );

    expect(updated?.coverImageId).not.toBe(oldImageId);
    expect(await database.images.count()).toBe(1);
    expect(oldImageId && (await database.images.get(oldImageId))).toBeUndefined();
    expect(
      oldImageId &&
        (await database.syncQueue.get(`coverImage:${oldImageId}`)),
    ).toMatchObject({ operation: "delete", parentId: created.id });
    expect(
      updated?.coverImageId &&
        (await database.syncQueue.get(`coverImage:${updated.coverImageId}`)),
    ).toMatchObject({ operation: "upsert", parentId: created.id });
  });

  it("supprime le livre, sa couverture et toutes ses notes", async () => {
    const created = await repository.create(
      {
        title: "Livre à supprimer",
        author: "Un auteur",
        status: "to_read",
      },
      image,
    );
    const notes = new NoteRepository(database);
    await notes.create(created.id, {
      extractedText: "Une note liée au livre",
      personalReflection: "",
      pageNumber: "12",
      tags: ["Test"],
    });

    expect(await repository.delete(created.id)).toBe(true);
    expect(await database.books.count()).toBe(0);
    expect(await database.images.count()).toBe(0);
    expect(await database.bookNotes.count()).toBe(0);
    expect(await database.syncQueue.get(`book:${created.id}`)).toMatchObject({
      operation: "delete",
    });
  });

  it("gère un livre inexistant sans exception", async () => {
    const missingId = "00000000-0000-4000-8000-000000000000";

    expect(await repository.get(missingId)).toBeUndefined();
    expect(
      await repository.update(missingId, {
        title: "Absent",
        author: "Personne",
        status: "to_read",
      }),
    ).toBeUndefined();
    expect(await repository.delete(missingId)).toBe(false);
  });
});
