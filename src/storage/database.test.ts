import Dexie, { type EntityTable } from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { Book, BookNote, StoredImage } from "@/domain/models";
import { BrainBookDatabase } from "@/storage/database";

class LegacyBrainBookDatabase extends Dexie {
  books!: EntityTable<Book, "id">;
  images!: EntityTable<StoredImage, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      books: "&id, updatedAt, title, author, status",
      images: "&id, createdAt",
    });
  }
}

class LegacyV3BrainBookDatabase extends Dexie {
  bookNotes!: EntityTable<BookNote, "id">;

  constructor(name: string) {
    super(name);
    this.version(3).stores({
      books: "&id, updatedAt, title, author, status",
      images: "&id, createdAt",
      bookNotes: "&id, bookId, createdAt, updatedAt",
      syncQueue:
        "&id, [entityType+entityId], entityType, operation, status, createdAt, updatedAt",
      syncMetadata: "&id, associatedUserId",
      localSafetyBackups: "&id, createdAt",
    });
  }
}

describe("BrainBookDatabase migrations", () => {
  const databasesToDelete: string[] = [];

  afterEach(async () => {
    await Promise.all(databasesToDelete.splice(0).map((name) => Dexie.delete(name)));
  });

  it("conserve les livres et crée l’Outbox lors du passage de v1 à v6", async () => {
    const name = `brainbook-migration-test-${crypto.randomUUID()}`;
    databasesToDelete.push(name);
    const legacy = new LegacyBrainBookDatabase(name);
    const existingBook: Book = {
      id: "10000000-0000-4000-8000-000000000000",
      title: "Livre existant",
      author: "Autrice",
      coverImageId: null,
      status: "to_read",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await legacy.books.add(existingBook);
    legacy.close();

    const migrated = new BrainBookDatabase(name);
    await migrated.open();

    expect(migrated.verno).toBe(6);
    expect(await migrated.books.get(existingBook.id)).toEqual({
      ...existingBook,
      contentType: "book",
      youtubeUrl: null,
      youtubeVideoId: null,
      thumbnailUrl: null,
    });
    expect(await migrated.bookNotes.count()).toBe(0);
    expect(await migrated.syncQueue.toArray()).toMatchObject([
      {
        id: `book:${existingBook.id}`,
        entityType: "book",
        entityId: existingBook.id,
        operation: "upsert",
        status: "pending",
      },
    ]);
    expect(await migrated.syncMetadata.get("primary")).toMatchObject({
      id: "primary",
      associatedUserId: null,
      firstSyncCompleted: false,
      schemaVersion: 1,
    });
    migrated.close();
  });

  it("initialise les métadonnées et le titre vide sans perdre les notes", async () => {
    const name = `brainbook-reading-migration-${crypto.randomUUID()}`;
    databasesToDelete.push(name);
    const legacy = new LegacyV3BrainBookDatabase(name);
    await legacy.open();
    const timestamp = "2026-01-01T00:00:00.000Z";
    const note = {
      id: "30000000-0000-4000-8000-000000000000" as const,
      bookId: "10000000-0000-4000-8000-000000000000" as const,
      extractedText: "Une idée existante",
      personalReflection: "",
      pageNumber: null,
      tags: [],
      sourceType: "manual" as const,
      sourceImageId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await legacy.bookNotes.add(note);
    legacy.close();

    const migrated = new BrainBookDatabase(name);
    await migrated.open();
    expect(await migrated.bookNotes.get(note.id)).toEqual({
      ...note,
      title: "",
      formattedContent: null,
    });
    expect(await migrated.noteReadingMetadata.get(note.id)).toMatchObject({
      noteId: note.id,
      isFavorite: false,
      isImportant: false,
      favoriteIndex: 0,
      importantIndex: 0,
      lastReadAt: null,
      readCount: 0,
      lastSuggestedAt: null,
    });
    expect(
      await migrated.syncQueue.get(`noteReadingMetadata:${note.id}`),
    ).toMatchObject({ operation: "upsert", status: "pending" });
    migrated.close();
  });
});
