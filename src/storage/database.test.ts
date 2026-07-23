import Dexie, { type EntityTable } from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { Book, StoredImage } from "@/domain/models";
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

describe("BrainBookDatabase migrations", () => {
  const databasesToDelete: string[] = [];

  afterEach(async () => {
    await Promise.all(databasesToDelete.splice(0).map((name) => Dexie.delete(name)));
  });

  it("conserve les livres existants lors du passage de v1 à v2", async () => {
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

    expect(migrated.verno).toBe(2);
    expect(await migrated.books.get(existingBook.id)).toEqual(existingBook);
    expect(await migrated.bookNotes.count()).toBe(0);
    migrated.close();
  });
});
