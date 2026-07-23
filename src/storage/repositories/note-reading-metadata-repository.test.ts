// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrainBookDatabase } from "@/storage/database";
import { BookRepository } from "@/storage/repositories/book-repository";
import { NoteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";
import { NoteRepository } from "@/storage/repositories/note-repository";

describe("NoteReadingMetadataRepository", () => {
  let database: BrainBookDatabase;

  beforeEach(() => {
    database = new BrainBookDatabase(`reading-metadata-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it("crée les métadonnées avec la note et les place dans l’Outbox", async () => {
    const book = await new BookRepository(database).create({
      title: "Livre",
      author: "Autrice",
      status: "reading",
    });
    const note = await new NoteRepository(database).create(book.id, {
      extractedText: "Passage",
      personalReflection: "",
      pageNumber: null,
      tags: [],
    });

    expect(await database.noteReadingMetadata.get(note.id)).toMatchObject({
      noteId: note.id,
      isFavorite: false,
      readCount: 0,
    });
    expect(
      await database.syncQueue.get(`noteReadingMetadata:${note.id}`),
    ).toMatchObject({ operation: "upsert", parentId: book.id });
  });

  it("met à jour les favoris et ne compte qu’une lecture par appel explicite", async () => {
    const book = await new BookRepository(database).create({
      title: "Livre",
      author: "Autrice",
      status: "reading",
    });
    const note = await new NoteRepository(database).create(book.id, {
      extractedText: "Passage",
      personalReflection: "",
      pageNumber: null,
      tags: [],
    });
    const repository = new NoteReadingMetadataRepository(database);

    await repository.setFavorite(note.id, true);
    await repository.recordRead(note.id);

    expect(await repository.get(note.id)).toMatchObject({
      isFavorite: true,
      favoriteIndex: 1,
      readCount: 1,
    });
    expect(await repository.listFavorites()).toHaveLength(1);
  });

  it("supprime en cascade les métadonnées avec la note", async () => {
    const book = await new BookRepository(database).create({
      title: "Livre",
      author: "Autrice",
      status: "reading",
    });
    const notes = new NoteRepository(database);
    const note = await notes.create(book.id, {
      extractedText: "Passage",
      personalReflection: "",
      pageNumber: null,
      tags: [],
    });

    await notes.delete(note.id);

    expect(await database.noteReadingMetadata.get(note.id)).toBeUndefined();
    expect(
      await database.syncQueue.get(`noteReadingMetadata:${note.id}`),
    ).toMatchObject({ operation: "delete" });
  });
});
