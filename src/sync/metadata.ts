import type { UUID } from "@/domain/models";
import type { BrainBookDatabase } from "@/storage/database";
import type { SyncMetadata } from "@/sync/types";

export async function getOrCreateSyncMetadata(
  database: BrainBookDatabase,
): Promise<SyncMetadata> {
  const existing = await database.syncMetadata.get("primary");
  if (existing) return existing;

  const metadata: SyncMetadata = {
    id: "primary",
    installationId: crypto.randomUUID() as UUID,
    associatedUserId: null,
    firstSyncCompleted: false,
    lastPushAt: null,
    lastPullAt: null,
    lastSuccessfulSyncAt: null,
    lastRestoreAt: null,
    schemaVersion: 1,
  };
  await database.syncMetadata.put(metadata);
  return metadata;
}

export async function updateSyncMetadata(
  database: BrainBookDatabase,
  changes: Partial<Omit<SyncMetadata, "id" | "installationId">>,
): Promise<SyncMetadata> {
  const existing = await getOrCreateSyncMetadata(database);
  const updated = { ...existing, ...changes };
  await database.syncMetadata.put(updated);
  return updated;
}
