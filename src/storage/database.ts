import Dexie, { type EntityTable } from "dexie";
import type { Book, BookNote, StoredImage } from "@/domain/models";

export class BrainBookDatabase extends Dexie {
  books!: EntityTable<Book, "id">;
  images!: EntityTable<StoredImage, "id">;
  bookNotes!: EntityTable<BookNote, "id">;

  constructor(name = "brainbook") {
    super(name);

    this.version(1).stores({
      books: "&id, updatedAt, title, author, status",
      images: "&id, createdAt",
    });

    this.version(2).stores({
      books: "&id, updatedAt, title, author, status",
      images: "&id, createdAt",
      bookNotes: "&id, bookId, createdAt, updatedAt",
    });
  }
}

export const brainBookDatabase = new BrainBookDatabase();
