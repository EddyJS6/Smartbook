import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrainBookDatabase } from "@/storage/database";
import { BookRepository } from "@/storage/repositories/book-repository";
import { NoteRepository } from "@/storage/repositories/note-repository";

describe("NoteRepository", () => {
  let database: BrainBookDatabase;
  let books: BookRepository;
  let notes: NoteRepository;

  beforeEach(() => {
    database = new BrainBookDatabase(`brainbook-note-test-${crypto.randomUUID()}`);
    books = new BookRepository(database);
    notes = new NoteRepository(database);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  async function createBook() {
    return books.create({
      title: "Sapiens",
      author: "Yuval Noah Harari",
      status: "reading",
    });
  }

  it("crée, normalise, relit et compte une note manuelle", async () => {
    const book = await createBook();
    const created = await notes.create(book.id, {
      extractedText: "  Un passage essentiel.  ",
      personalReflection: "",
      pageNumber: "  chapitre 2 ",
      tags: [" Histoire ", "histoire", "Société"],
    });

    expect(created).toMatchObject({
      bookId: book.id,
      extractedText: "Un passage essentiel.",
      personalReflection: "",
      pageNumber: "chapitre 2",
      tags: ["Histoire", "Société"],
      sourceType: "manual",
      sourceImageId: null,
    });
    expect(await notes.get(created.id)).toEqual(created);
    expect(await notes.listByBook(book.id)).toEqual([created]);
    expect(await notes.countByBook(book.id)).toBe(1);
  });

  it("enregistre une note scannée sans conserver la photo source", async () => {
    const book = await createBook();
    const created = await notes.create(
      book.id,
      {
        extractedText: "Passage corrigé après OCR",
        personalReflection: "Une réflexion personnelle",
        pageNumber: "p. 24",
        tags: ["OCR"],
      },
      "scan",
    );

    expect(created).toMatchObject({
      sourceType: "scan",
      sourceImageId: null,
      extractedText: "Passage corrigé après OCR",
      personalReflection: "Une réflexion personnelle",
      tags: ["OCR"],
    });
    expect(await database.images.count()).toBe(0);
  });

  it("modifie le contenu sans changer l’identité ni la provenance", async () => {
    const book = await createBook();
    const created = await notes.create(book.id, {
      extractedText: "Texte initial",
      personalReflection: "",
      pageNumber: null,
      tags: [],
    });

    const updated = await notes.update(created.id, {
      extractedText: "",
      personalReflection: "Réflexion mise à jour",
      pageNumber: "p. 18",
      tags: ["Action"],
    });

    expect(updated).toMatchObject({
      id: created.id,
      bookId: created.bookId,
      createdAt: created.createdAt,
      sourceType: "manual",
      sourceImageId: null,
      extractedText: "",
      personalReflection: "Réflexion mise à jour",
      pageNumber: "p. 18",
      tags: ["Action"],
    });
  });

  it("supprime une note sans supprimer son livre", async () => {
    const book = await createBook();
    const created = await notes.create(book.id, {
      extractedText: "À supprimer",
      personalReflection: "",
      pageNumber: null,
      tags: [],
    });

    expect(await notes.delete(created.id)).toBe(true);
    expect(await notes.get(created.id)).toBeUndefined();
    expect(await books.get(book.id)).toEqual(book);
    expect(await notes.delete(created.id)).toBe(false);
  });

  it("gère une note inexistante sans exception", async () => {
    const missingId = "00000000-0000-4000-8000-000000000000";

    expect(await notes.get(missingId)).toBeUndefined();
    expect(
      await notes.update(missingId, {
        extractedText: "Absent",
        personalReflection: "",
        pageNumber: null,
        tags: [],
      }),
    ).toBeUndefined();
    expect(await notes.delete(missingId)).toBe(false);
  });

  it("refuse de créer une note pour un livre inexistant", async () => {
    await expect(
      notes.create("00000000-0000-4000-8000-000000000000", {
        extractedText: "Texte orphelin",
        personalReflection: "",
        pageNumber: null,
        tags: [],
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});
