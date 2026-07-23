import type {
  Book,
  BookNote,
  NoteReadingMetadata,
  UUID,
} from "@/domain/models";

export type SyncEntityType =
  | "book"
  | "bookNote"
  | "coverImage"
  | "noteReadingMetadata";
export type SyncOperation = "upsert" | "delete";
export type SyncQueueStatus = "pending" | "processing" | "failed";

export interface SyncQueueEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: UUID;
  parentId: UUID | null;
  operation: SyncOperation;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError?: string;
  status: SyncQueueStatus;
}

export interface SyncMetadata {
  id: "primary";
  installationId: UUID;
  associatedUserId: UUID | null;
  firstSyncCompleted: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRestoreAt: string | null;
  schemaVersion: number;
}

export interface LocalSafetyBackup {
  id: UUID;
  createdAt: string;
  reason: "restore" | "merge" | "account_change";
  schemaVersion: 1 | 2;
  books: Book[];
  notes: BookNote[];
  noteReadingMetadata?: NoteReadingMetadata[];
  coverImageIds: UUID[];
}

export type RemoteBookRow = {
  id: string;
  user_id: string;
  title: string;
  author: string;
  status: string;
  cover_storage_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
};

export type RemoteNoteRow = {
  id: string;
  user_id: string;
  book_id: string;
  extracted_text: string;
  personal_reflection: string;
  page_number: string | null;
  tags: unknown;
  source_type: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
};

export type RemoteNoteReadingMetadataRow = {
  note_id: string;
  user_id: string;
  is_favorite: boolean;
  is_important: boolean;
  last_read_at: string | null;
  read_count: number;
  last_suggested_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
};

export type InitialSyncCase =
  | "bothEmpty"
  | "localOnly"
  | "cloudOnly"
  | "bothFilled"
  | "accountMismatch";

export type InitialSyncInspection = {
  kind: InitialSyncCase;
  localBooks: number;
  localNotes: number;
  localCovers: number;
  remoteBooks: number;
  remoteNotes: number;
  remoteLastUpdatedAt: string | null;
  associatedUserId: UUID | null;
};

export type AccountInitializationResult =
  | {
      status: "ready";
      action: "alreadyReady" | "enabled" | "uploaded" | "downloaded";
    }
  | {
      status: "needsMerge" | "accountMismatch";
      inspection: InitialSyncInspection;
    };

export type SyncStatus = {
  configured: boolean;
  online: boolean;
  running: boolean;
  pendingCount: number;
  failedCount: number;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastRestoreAt: string | null;
  firstSyncCompleted: boolean;
  associatedUserId: UUID | null;
};
