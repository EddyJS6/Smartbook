import Dexie, { type EntityTable } from "dexie";
import type { Book, StoredImage } from "@/domain/models";

export class BrainBookDatabase extends Dexie {
  books!: EntityTable<Book, "id">;
  images!: EntityTable<StoredImage, "id">;

  constructor(name = "brainbook") {
    super(name);

    this.version(1).stores({
      books: "&id, updatedAt, title, author, status",
      images: "&id, createdAt",
    });
  }
}

export const brainBookDatabase = new BrainBookDatabase();
