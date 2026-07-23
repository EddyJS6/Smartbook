import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrainBookDatabase } from "@/storage/database";
import {
  enqueueSyncOperation,
  markSyncAttemptFailed,
  markSyncOperationSucceeded,
  retryFailedSyncOperations,
} from "@/sync/queue";

const bookId = "10000000-0000-4000-8000-000000000000";

describe("sync queue", () => {
  let database: BrainBookDatabase;

  beforeEach(() => {
    database = new BrainBookDatabase(`queue-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it("ajoute et déduplique plusieurs upserts", async () => {
    await enqueueSyncOperation(database, "book", bookId, "upsert");
    await enqueueSyncOperation(database, "book", bookId, "upsert");

    expect(await database.syncQueue.count()).toBe(1);
    expect(await database.syncQueue.get(`book:${bookId}`)).toMatchObject({
      operation: "upsert",
      attemptCount: 0,
      status: "pending",
    });
  });

  it("fait primer une suppression sur l’ancien upsert", async () => {
    await enqueueSyncOperation(database, "book", bookId, "upsert");
    await enqueueSyncOperation(database, "book", bookId, "delete");

    expect(await database.syncQueue.get(`book:${bookId}`)).toMatchObject({
      operation: "delete",
      status: "pending",
    });
  });

  it("compte les essais, marque failed, permet le retry et nettoie le succès", async () => {
    let entry = await enqueueSyncOperation(
      database,
      "book",
      bookId,
      "upsert",
    );
    entry = await markSyncAttemptFailed(database, entry, "temporaire", false);
    expect(entry).toMatchObject({ attemptCount: 1, status: "pending" });
    entry = await markSyncAttemptFailed(database, entry, "temporaire", false);
    entry = await markSyncAttemptFailed(database, entry, "temporaire", false);
    expect(entry).toMatchObject({ attemptCount: 3, status: "failed" });

    expect(await retryFailedSyncOperations(database)).toBe(1);
    entry = (await database.syncQueue.get(entry.id))!;
    expect(entry).toMatchObject({
      attemptCount: 0,
      lastAttemptAt: null,
      status: "pending",
    });

    await markSyncOperationSucceeded(database, entry.id);
    expect(await database.syncQueue.count()).toBe(0);
  });

  it("marque immédiatement failed une erreur permanente", async () => {
    const entry = await enqueueSyncOperation(
      database,
      "book",
      bookId,
      "upsert",
    );
    expect(
      await markSyncAttemptFailed(database, entry, "RLS", true),
    ).toMatchObject({ attemptCount: 1, status: "failed", lastError: "RLS" });
  });
});
