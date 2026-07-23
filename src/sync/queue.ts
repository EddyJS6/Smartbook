import type { UUID } from "@/domain/models";
import type { BrainBookDatabase } from "@/storage/database";
import type {
  SyncEntityType,
  SyncOperation,
  SyncQueueEntry,
} from "@/sync/types";

export function syncQueueKey(
  entityType: SyncEntityType,
  entityId: UUID,
): string {
  return `${entityType}:${entityId}`;
}

export async function enqueueSyncOperation(
  database: BrainBookDatabase,
  entityType: SyncEntityType,
  entityId: UUID,
  operation: SyncOperation,
  parentId: UUID | null = null,
  timestamp = new Date().toISOString(),
): Promise<SyncQueueEntry> {
  const id = syncQueueKey(entityType, entityId);
  const existing = await database.syncQueue.get(id);
  const entry: SyncQueueEntry = {
    id,
    entityType,
    entityId,
    parentId: parentId ?? existing?.parentId ?? null,
    operation,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    attemptCount: 0,
    lastAttemptAt: null,
    status: "pending",
  };

  await database.syncQueue.put(entry);
  return entry;
}

export async function markSyncAttemptFailed(
  database: BrainBookDatabase,
  entry: SyncQueueEntry,
  message: string,
  permanent: boolean,
  timestamp = new Date().toISOString(),
): Promise<SyncQueueEntry> {
  const attemptCount = entry.attemptCount + 1;
  const updated: SyncQueueEntry = {
    ...entry,
    attemptCount,
    lastAttemptAt: timestamp,
    lastError: message,
    status: permanent || attemptCount >= 3 ? "failed" : "pending",
    updatedAt: timestamp,
  };
  await database.syncQueue.put(updated);
  return updated;
}

export async function retryFailedSyncOperations(
  database: BrainBookDatabase,
): Promise<number> {
  const failed = await database.syncQueue.where("status").equals("failed").toArray();
  if (failed.length === 0) return 0;

  const timestamp = new Date().toISOString();
  await database.syncQueue.bulkPut(
    failed.map((entry) => ({
      ...entry,
      attemptCount: 0,
      lastAttemptAt: null,
      lastError: undefined,
      status: "pending" as const,
      updatedAt: timestamp,
    })),
  );
  return failed.length;
}

export async function markSyncOperationSucceeded(
  database: BrainBookDatabase,
  id: string,
): Promise<void> {
  await database.syncQueue.delete(id);
}

export function notifyLocalMutation(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("brainbook:local-mutation"));
}
