import Dexie, { type EntityTable } from "dexie";
import type { Book, BookNote, StoredImage } from "@/domain/models";
import type {
  LocalSafetyBackup,
  SyncMetadata,
  SyncQueueEntry,
} from "@/sync/types";
import { syncQueueKey } from "@/sync/queue";

export class BrainBookDatabase extends Dexie {
  books!: EntityTable<Book, "id">;
  images!: EntityTable<StoredImage, "id">;
  bookNotes!: EntityTable<BookNote, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "id">;
  localSafetyBackups!: EntityTable<LocalSafetyBackup, "id">;

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

    this.version(3)
      .stores({
        books: "&id, updatedAt, title, author, status",
        images: "&id, createdAt",
        bookNotes: "&id, bookId, createdAt, updatedAt",
        syncQueue:
          "&id, [entityType+entityId], entityType, operation, status, createdAt, updatedAt",
        syncMetadata: "&id, associatedUserId",
        localSafetyBackups: "&id, createdAt",
      })
      .upgrade(async (transaction) => {
        const timestamp = new Date().toISOString();
        const [books, notes] = await Promise.all([
          transaction.table<Book>("books").toArray(),
          transaction.table<BookNote>("bookNotes").toArray(),
        ]);
        const queue = transaction.table<SyncQueueEntry>("syncQueue");
        const entries: SyncQueueEntry[] = [];

        for (const book of books) {
          if (book.coverImageId) {
            entries.push({
              id: syncQueueKey("coverImage", book.coverImageId),
              entityType: "coverImage",
              entityId: book.coverImageId,
              parentId: book.id,
              operation: "upsert",
              createdAt: timestamp,
              updatedAt: timestamp,
              attemptCount: 0,
              lastAttemptAt: null,
              status: "pending",
            });
          }
          entries.push({
            id: syncQueueKey("book", book.id),
            entityType: "book",
            entityId: book.id,
            parentId: null,
            operation: "upsert",
            createdAt: timestamp,
            updatedAt: timestamp,
            attemptCount: 0,
            lastAttemptAt: null,
            status: "pending",
          });
        }

        for (const note of notes) {
          entries.push({
            id: syncQueueKey("bookNote", note.id),
            entityType: "bookNote",
            entityId: note.id,
            parentId: note.bookId,
            operation: "upsert",
            createdAt: timestamp,
            updatedAt: timestamp,
            attemptCount: 0,
            lastAttemptAt: null,
            status: "pending",
          });
        }

        if (entries.length > 0) await queue.bulkPut(entries);
        await transaction.table<SyncMetadata>("syncMetadata").put({
          id: "primary",
          installationId: crypto.randomUUID() as SyncMetadata["installationId"],
          associatedUserId: null,
          firstSyncCompleted: false,
          lastPushAt: null,
          lastPullAt: null,
          lastSuccessfulSyncAt: null,
          lastRestoreAt: null,
          schemaVersion: 1,
        });
      });
  }
}

export const brainBookDatabase = new BrainBookDatabase();
