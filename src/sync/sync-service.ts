"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Book,
  BookNote,
  NoteReadingMetadata,
  StoredImage,
  UUID,
} from "@/domain/models";
import { createEntityId } from "@/domain/id";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSupabaseClient,
  supabaseConfiguration,
} from "@/lib/supabase/client";
import {
  brainBookDatabase,
  type BrainBookDatabase,
} from "@/storage/database";
import { createDefaultReadingMetadata } from "@/storage/repositories/note-reading-metadata-repository";
import {
  createCoverStoragePath,
  deleteCover,
  downloadCover,
  parseCoverStoragePath,
  uploadCover,
} from "@/sync/cover-storage";
import {
  bookToRemote,
  isRemoteDeletionNewer,
  noteToRemote,
  noteReadingMetadataToRemote,
  remoteBookToLocal,
  remoteNoteToLocal,
  remoteNoteReadingMetadataToLocal,
  remoteWinsConflict,
  RemoteDataValidationError,
} from "@/sync/mapping";
import {
  getOrCreateSyncMetadata,
  updateSyncMetadata,
} from "@/sync/metadata";
import {
  enqueueSyncOperation,
  markSyncOperationSucceeded,
  markSyncAttemptFailed,
  retryFailedSyncOperations,
  syncQueueKey,
} from "@/sync/queue";
import { determineInitialSyncCase } from "@/sync/initial-sync";
import type {
  AccountInitializationResult,
  InitialSyncInspection,
  LocalSafetyBackup,
  RemoteBookRow,
  RemoteNoteRow,
  RemoteNoteReadingMetadataRow,
  SyncMetadata,
  SyncQueueEntry,
  SyncStatus,
} from "@/sync/types";

const BOOK_COLUMNS =
  "user_id,id,title,author,content_type,youtube_url,youtube_video_id,thumbnail_url,status,cover_storage_path,created_at,updated_at,deleted_at,server_updated_at";
const NOTE_COLUMNS =
  "user_id,id,book_id,title,extracted_text,personal_reflection,page_number,tags,source_type,created_at,updated_at,deleted_at,server_updated_at";
const READING_METADATA_COLUMNS =
  "user_id,note_id,is_favorite,is_important,last_read_at,read_count,last_suggested_at,created_at,updated_at,deleted_at,server_updated_at";
const MAX_RETRY_DELAY_MS = 60_000;

type RemoteSnapshot = {
  books: RemoteBookRow[];
  notes: RemoteNoteRow[];
  noteReadingMetadata: RemoteNoteReadingMetadataRow[];
};

type SyncRunResult = {
  pushed: number;
  pulledBooks: number;
  pulledNotes: number;
  warnings: string[];
};

export class SyncServiceError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "offline"
      | "auth"
      | "account_mismatch"
      | "not_initialized"
      | "remote"
      | "cancelled",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SyncServiceError";
  }
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function emitSyncStatusChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("brainbook:sync-status"));
  }
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof SyncServiceError || error instanceof RemoteDataValidationError) {
    return error.message;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (/row.level.security|rls|permission|policy/i.test(error.message)) {
      return "Supabase a refusé l’opération de sauvegarde. Vérifiez les politiques RLS.";
    }
    if (/bucket|storage/i.test(error.message)) {
      return "La sauvegarde de la couverture a échoué. Vérifiez le bucket privé book-covers.";
    }
  }
  return "La sauvegarde cloud a rencontré une erreur temporaire.";
}

function isPermanentRemoteError(error: unknown): boolean {
  if (error instanceof RemoteDataValidationError) return true;
  if (error instanceof SyncServiceError) {
    return ["not_configured", "auth", "account_mismatch"].includes(error.code);
  }
  if (error && typeof error === "object") {
    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    const code =
      "code" in error && typeof error.code === "string" ? error.code : "";
    return (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      code.startsWith("22") ||
      code === "42501" ||
      code === "42P01"
    );
  }
  return false;
}

function retryIsDue(entry: SyncQueueEntry, now = Date.now()): boolean {
  if (!entry.lastAttemptAt || entry.attemptCount === 0) return true;
  const lastAttempt = Date.parse(entry.lastAttemptAt);
  if (!Number.isFinite(lastAttempt)) return true;
  const delay = Math.min(
    MAX_RETRY_DELAY_MS,
    1_000 * 2 ** Math.max(0, entry.attemptCount - 1),
  );
  return now - lastAttempt >= delay;
}

function queuePriority(entry: SyncQueueEntry): number {
  if (entry.operation === "upsert") {
    if (entry.entityType === "coverImage") return 10;
    if (entry.entityType === "book") return 20;
    if (entry.entityType === "bookNote") return 30;
    return 35;
  }
  if (entry.entityType === "noteReadingMetadata") return 38;
  if (entry.entityType === "bookNote") return 40;
  if (entry.entityType === "book") return 50;
  return 60;
}

export class SyncService {
  private currentRun: Promise<SyncRunResult> | null = null;
  private generation = 0;

  constructor(
    private readonly database: BrainBookDatabase,
    private readonly clientFactory: () => SupabaseClient<Database> | null,
    private readonly configured = () => supabaseConfiguration.configured,
  ) {}

  cancelCurrentSync(): void {
    this.generation += 1;
    this.currentRun = null;
    emitSyncStatusChanged();
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) {
      throw new SyncServiceError(
        "cancelled",
        "La synchronisation a été interrompue.",
      );
    }
  }

  private async withLock(
    task: (generation: number) => Promise<SyncRunResult>,
  ): Promise<SyncRunResult> {
    if (this.currentRun) return this.currentRun;
    const generation = this.generation;
    emitSyncStatusChanged();
    const run = task(generation).finally(() => {
      if (this.currentRun === run) this.currentRun = null;
      emitSyncStatusChanged();
    });
    this.currentRun = run;
    emitSyncStatusChanged();
    return run;
  }

  private requireClient(): SupabaseClient<Database> {
    if (!this.configured()) {
      throw new SyncServiceError(
        "not_configured",
        "La sauvegarde cloud n’est pas configurée.",
      );
    }
    const client = this.clientFactory();
    if (!client) {
      throw new SyncServiceError(
        "not_configured",
        "La sauvegarde cloud n’est pas configurée.",
      );
    }
    return client;
  }

  private requireOnline(): void {
    if (!isOnline()) {
      throw new SyncServiceError(
        "offline",
        "La synchronisation reprendra lorsque la connexion Internet sera disponible.",
      );
    }
  }

  private async requireAuthenticatedClient(
    expectedUserId: UUID,
  ): Promise<SupabaseClient<Database>> {
    this.requireOnline();
    const client = this.requireClient();
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error || !session || session.user.id !== expectedUserId) {
      throw new SyncServiceError(
        "auth",
        "La session Supabase n’est plus valide. Reconnectez-vous.",
        { cause: error ?? undefined },
      );
    }
    return client;
  }

  private async ensureAccountAllowed(userId: UUID): Promise<SyncMetadata> {
    const metadata = await getOrCreateSyncMetadata(this.database);
    if (
      metadata.associatedUserId &&
      metadata.associatedUserId !== userId
    ) {
      throw new SyncServiceError(
        "account_mismatch",
        "Les données locales sont associées à un autre compte. La synchronisation automatique est bloquée.",
      );
    }
    return metadata;
  }

  private async fetchRemoteSnapshot(
    client: SupabaseClient<Database>,
    userId: UUID,
  ): Promise<RemoteSnapshot> {
    const [booksResponse, notesResponse, readingMetadataResponse] =
      await Promise.all([
      client
        .from("books")
        .select(BOOK_COLUMNS)
        .eq("user_id", userId),
      client
        .from("book_notes")
        .select(NOTE_COLUMNS)
        .eq("user_id", userId),
      client
        .from("note_reading_metadata")
        .select(READING_METADATA_COLUMNS)
        .eq("user_id", userId),
    ]);
    if (booksResponse.error) throw booksResponse.error;
    if (notesResponse.error) throw notesResponse.error;
    if (readingMetadataResponse.error) throw readingMetadataResponse.error;
    return {
      books: (booksResponse.data ?? []) as RemoteBookRow[],
      notes: (notesResponse.data ?? []) as RemoteNoteRow[],
      noteReadingMetadata:
        (readingMetadataResponse.data ?? []) as RemoteNoteReadingMetadataRow[],
    };
  }

  async inspectInitialSync(userId: UUID): Promise<InitialSyncInspection> {
    const metadata = await getOrCreateSyncMetadata(this.database);
    const [localBooks, localNotes, localCovers] = await Promise.all([
      this.database.books.count(),
      this.database.bookNotes.count(),
      this.database.images.count(),
    ]);
    if (
      metadata.associatedUserId &&
      metadata.associatedUserId !== userId
    ) {
      return {
        kind: "accountMismatch",
        localBooks,
        localNotes,
        localCovers,
        remoteBooks: 0,
        remoteNotes: 0,
        remoteLastUpdatedAt: null,
        associatedUserId: metadata.associatedUserId,
      };
    }

    const client = await this.requireAuthenticatedClient(userId);
    const remote = await this.fetchRemoteSnapshot(client, userId);
    const activeBooks = remote.books.filter((row) => !row.deleted_at);
    const activeNotes = remote.notes.filter((row) => !row.deleted_at);
    const latest = [
      ...activeBooks,
      ...activeNotes,
      ...remote.noteReadingMetadata.filter((row) => !row.deleted_at),
    ]
      .map((row) => row.server_updated_at)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort()
      .at(-1) ?? null;
    return {
      kind: determineInitialSyncCase(
        localBooks,
        localNotes,
        activeBooks.length,
        activeNotes.length,
      ),
      localBooks,
      localNotes,
      localCovers,
      remoteBooks: activeBooks.length,
      remoteNotes: activeNotes.length,
      remoteLastUpdatedAt: latest,
      associatedUserId: metadata.associatedUserId,
    };
  }

  async initializeAccount(
    userId: UUID,
  ): Promise<AccountInitializationResult> {
    const metadata = await getOrCreateSyncMetadata(this.database);
    if (
      metadata.firstSyncCompleted &&
      metadata.associatedUserId === userId
    ) {
      return { status: "ready", action: "alreadyReady" };
    }

    const inspection = await this.inspectInitialSync(userId);
    switch (inspection.kind) {
      case "accountMismatch":
        return { status: "accountMismatch", inspection };
      case "bothFilled":
        return { status: "needsMerge", inspection };
      case "bothEmpty":
        await this.enableEmptyBackup(userId);
        return { status: "ready", action: "enabled" };
      case "localOnly":
        await this.backupLocalData(userId);
        return { status: "ready", action: "uploaded" };
      case "cloudOnly":
        await this.restoreFromCloud(userId, true);
        return { status: "ready", action: "downloaded" };
    }
  }

  private async seedFullBackupQueue(timestamp = new Date().toISOString()) {
    const [books, notes, noteReadingMetadata] = await Promise.all([
      this.database.books.toArray(),
      this.database.bookNotes.toArray(),
      this.database.noteReadingMetadata.toArray(),
    ]);
    await this.database.transaction(
      "rw",
      this.database.syncQueue,
      async () => {
        for (const book of books) {
          if (book.coverImageId) {
            await enqueueSyncOperation(
              this.database,
              "coverImage",
              book.coverImageId,
              "upsert",
              book.id,
              timestamp,
            );
          }
          await enqueueSyncOperation(
            this.database,
            "book",
            book.id,
            "upsert",
            null,
            timestamp,
          );
        }
        for (const note of notes) {
          await enqueueSyncOperation(
            this.database,
            "bookNote",
            note.id,
            "upsert",
            note.bookId,
            timestamp,
          );
        }
        for (const metadata of noteReadingMetadata) {
          const note = notes.find((candidate) => candidate.id === metadata.noteId);
          if (!note) continue;
          await enqueueSyncOperation(
            this.database,
            "noteReadingMetadata",
            metadata.noteId,
            "upsert",
            note.bookId,
            timestamp,
          );
        }
      },
    );
  }

  private async processQueue(
    client: SupabaseClient<Database>,
    userId: UUID,
    generation: number,
  ): Promise<{ pushed: number; failed: number }> {
    const processing = await this.database.syncQueue
      .where("status")
      .equals("processing")
      .toArray();
    if (processing.length > 0) {
      await this.database.syncQueue.bulkPut(
        processing.map((entry) => ({ ...entry, status: "pending" as const })),
      );
    }

    const entries = (await this.database.syncQueue
      .where("status")
      .equals("pending")
      .toArray())
      .filter((entry) => retryIsDue(entry))
      .sort((left, right) => queuePriority(left) - queuePriority(right));
    let pushed = 0;
    let failed = 0;

    for (const entry of entries) {
      this.assertCurrent(generation);
      const current = await this.database.syncQueue.get(entry.id);
      if (!current || current.status !== "pending") continue;
      await this.database.syncQueue.put({
        ...current,
        status: "processing",
      });
      emitSyncStatusChanged();

      try {
        await this.processQueueEntry(client, userId, current);
        this.assertCurrent(generation);
        await markSyncOperationSucceeded(this.database, current.id);
        pushed += 1;
      } catch (error) {
        if (
          error instanceof SyncServiceError &&
          error.code === "cancelled"
        ) {
          throw error;
        }
        await markSyncAttemptFailed(
          this.database,
          current,
          safeErrorMessage(error),
          isPermanentRemoteError(error),
        );
        failed += 1;
      }
    }
    emitSyncStatusChanged();
    return { pushed, failed };
  }

  private async processQueueEntry(
    client: SupabaseClient<Database>,
    userId: UUID,
    entry: SyncQueueEntry,
  ): Promise<void> {
    if (entry.entityType === "coverImage") {
      if (!entry.parentId) {
        throw new RemoteDataValidationError(
          "Une opération de couverture ne référence aucun livre.",
        );
      }
      const path = createCoverStoragePath(
        userId,
        entry.parentId,
        entry.entityId,
      );
      if (entry.operation === "delete") {
        await deleteCover(client, path);
        return;
      }
      const image = await this.database.images.get(entry.entityId);
      if (!image) {
        throw new RemoteDataValidationError(
          "La couverture locale à sauvegarder n’existe plus.",
        );
      }
      await uploadCover(client, path, image);
      return;
    }

    if (entry.entityType === "book") {
      if (entry.operation === "delete") {
        const deletedAt = entry.updatedAt;
        const notesResult = await client
          .from("book_notes")
          .update({ deleted_at: deletedAt })
          .eq("user_id", userId)
          .eq("book_id", entry.entityId);
        if (notesResult.error) throw notesResult.error;
        const bookResult = await client
          .from("books")
          .update({ deleted_at: deletedAt })
          .eq("user_id", userId)
          .eq("id", entry.entityId);
        if (bookResult.error) throw bookResult.error;
        return;
      }
      const book = await this.database.books.get(entry.entityId);
      if (!book) {
        throw new RemoteDataValidationError(
          "Le livre local à sauvegarder n’existe plus.",
        );
      }
      const coverPath = book.coverImageId
        ? createCoverStoragePath(userId, book.id, book.coverImageId)
        : null;
      const { error } = await client
        .from("books")
        .upsert(bookToRemote(book, userId, coverPath), {
          onConflict: "user_id,id",
        });
      if (error) throw error;
      return;
    }

    if (entry.entityType === "noteReadingMetadata") {
      if (entry.operation === "delete") {
        const { error } = await client
          .from("note_reading_metadata")
          .update({ deleted_at: entry.updatedAt })
          .eq("user_id", userId)
          .eq("note_id", entry.entityId);
        if (error) throw error;
        return;
      }
      const metadata = await this.database.noteReadingMetadata.get(
        entry.entityId,
      );
      if (!metadata) {
        throw new RemoteDataValidationError(
          "Les métadonnées de lecture locales n’existent plus.",
        );
      }
      const { error } = await client
        .from("note_reading_metadata")
        .upsert(noteReadingMetadataToRemote(metadata, userId), {
          onConflict: "user_id,note_id",
        });
      if (error) throw error;
      return;
    }

    if (entry.operation === "delete") {
      const metadataResult = await client
        .from("note_reading_metadata")
        .update({ deleted_at: entry.updatedAt })
        .eq("user_id", userId)
        .eq("note_id", entry.entityId);
      if (metadataResult.error) throw metadataResult.error;
      const { error } = await client
        .from("book_notes")
        .update({ deleted_at: entry.updatedAt })
        .eq("user_id", userId)
        .eq("id", entry.entityId);
      if (error) throw error;
      return;
    }

    const note = await this.database.bookNotes.get(entry.entityId);
    if (!note) {
      throw new RemoteDataValidationError(
        "La note locale à sauvegarder n’existe plus.",
      );
    }
    const { error } = await client
      .from("book_notes")
      .upsert(noteToRemote(note, userId), {
        onConflict: "user_id,id",
      });
    if (error) throw error;
  }

  private async prepareRemoteBooks(
    client: SupabaseClient<Database>,
    userId: UUID,
    rows: RemoteBookRow[],
    ignorePending: boolean,
  ): Promise<{
    booksToPut: Book[];
    imagesToPut: StoredImage[];
    bookIdsToDelete: UUID[];
    oldImageIdsToDelete: UUID[];
    warnings: string[];
  }> {
    const booksToPut: Book[] = [];
    const imagesToPut: StoredImage[] = [];
    const bookIdsToDelete: UUID[] = [];
    const oldImageIdsToDelete: UUID[] = [];
    const warnings: string[] = [];

    for (const row of rows) {
      if (row.user_id !== userId) {
        warnings.push("Un livre distant d’un autre compte a été ignoré.");
        continue;
      }
      const local = await this.database.books.get(row.id as UUID);
      const pending = ignorePending
        ? undefined
        : await this.database.syncQueue.get(
            syncQueueKey("book", row.id as UUID),
          );

      if (row.deleted_at) {
        if (
          local &&
          (!pending ||
            (pending.operation === "upsert" &&
              isRemoteDeletionNewer(row.deleted_at, local.updatedAt)))
        ) {
          bookIdsToDelete.push(local.id);
          if (local.coverImageId) oldImageIdsToDelete.push(local.coverImageId);
        }
        continue;
      }

      if (
        pending ||
        (local &&
          !remoteWinsConflict(
            local.updatedAt,
            row.updated_at,
            false,
          ))
      ) {
        continue;
      }

      let coverImageId: UUID | null = null;
      if (row.cover_storage_path) {
        try {
          const remoteImageId = parseCoverStoragePath(
            row.cover_storage_path,
            userId,
            row.id as UUID,
          );
          const existingImage = await this.database.images.get(remoteImageId);
          if (existingImage) {
            coverImageId = remoteImageId;
          } else {
            const image = await downloadCover(
              client,
              row.cover_storage_path,
              remoteImageId,
              row.updated_at,
            );
            imagesToPut.push(image);
            coverImageId = image.id;
          }
        } catch {
          warnings.push(
            `La couverture du livre distant ${row.id} n’a pas pu être restaurée.`,
          );
        }
      }

      try {
        const mapped = remoteBookToLocal(row, userId, coverImageId);
        booksToPut.push(mapped);
        if (
          local?.coverImageId &&
          local.coverImageId !== coverImageId
        ) {
          oldImageIdsToDelete.push(local.coverImageId);
        }
      } catch (error) {
        warnings.push(safeErrorMessage(error));
      }
    }

    return {
      booksToPut,
      imagesToPut,
      bookIdsToDelete,
      oldImageIdsToDelete,
      warnings,
    };
  }

  private async pullRemoteChangesInternal(
    client: SupabaseClient<Database>,
    userId: UUID,
    generation: number,
    ignorePending = false,
  ): Promise<{ books: number; notes: number; warnings: string[] }> {
    const remote = await this.fetchRemoteSnapshot(client, userId);
    this.assertCurrent(generation);
    const preparedBooks = await this.prepareRemoteBooks(
      client,
      userId,
      remote.books,
      ignorePending,
    );
    this.assertCurrent(generation);

    const currentBooks = new Map(
      (await this.database.books.toArray()).map((book) => [book.id, book]),
    );
    for (const id of preparedBooks.bookIdsToDelete) currentBooks.delete(id);
    for (const book of preparedBooks.booksToPut) currentBooks.set(book.id, book);
    const knownBookIds = new Set(currentBooks.keys());
    const notesToPut: BookNote[] = [];
    const noteIdsToDelete: UUID[] = [];
    const warnings = [...preparedBooks.warnings];

    for (const row of remote.notes) {
      if (row.user_id !== userId) {
        warnings.push("Une note distante d’un autre compte a été ignorée.");
        continue;
      }
      const noteId = row.id as UUID;
      const local = await this.database.bookNotes.get(noteId);
      const pending = ignorePending
        ? undefined
        : await this.database.syncQueue.get(
            syncQueueKey("bookNote", noteId),
          );

      if (row.deleted_at) {
        if (
          local &&
          (!pending ||
            (pending.operation === "upsert" &&
              isRemoteDeletionNewer(row.deleted_at, local.updatedAt)))
        ) {
          noteIdsToDelete.push(local.id);
        }
        continue;
      }
      if (
        pending ||
        (local &&
          !remoteWinsConflict(local.updatedAt, row.updated_at, false))
      ) {
        continue;
      }
      try {
        notesToPut.push(remoteNoteToLocal(row, userId, knownBookIds));
      } catch (error) {
        warnings.push(safeErrorMessage(error));
      }
    }

    const currentNotes = new Map(
      (await this.database.bookNotes.toArray()).map((note) => [note.id, note]),
    );
    for (const noteId of noteIdsToDelete) currentNotes.delete(noteId);
    for (const note of notesToPut) currentNotes.set(note.id, note);
    for (const bookId of preparedBooks.bookIdsToDelete) {
      for (const [noteId, note] of currentNotes) {
        if (note.bookId === bookId) currentNotes.delete(noteId);
      }
    }
    const knownNoteIds = new Set(currentNotes.keys());
    const readingMetadataToPut: NoteReadingMetadata[] = [];
    const readingMetadataIdsToDelete: UUID[] = [];
    const remoteActiveMetadataIds = new Set<UUID>();

    for (const row of remote.noteReadingMetadata) {
      if (row.user_id !== userId) {
        warnings.push(
          "Des métadonnées de lecture d’un autre compte ont été ignorées.",
        );
        continue;
      }
      const noteId = row.note_id as UUID;
      const local = await this.database.noteReadingMetadata.get(noteId);
      const pending = ignorePending
        ? undefined
        : await this.database.syncQueue.get(
            syncQueueKey("noteReadingMetadata", noteId),
          );
      if (row.deleted_at) {
        if (
          local &&
          (!pending ||
            (pending.operation === "upsert" &&
              isRemoteDeletionNewer(row.deleted_at, local.updatedAt)))
        ) {
          readingMetadataIdsToDelete.push(noteId);
        }
        continue;
      }
      remoteActiveMetadataIds.add(noteId);
      if (
        pending ||
        (local &&
          !remoteWinsConflict(local.updatedAt, row.updated_at, false))
      ) {
        continue;
      }
      try {
        readingMetadataToPut.push(
          remoteNoteReadingMetadataToLocal(row, userId, knownNoteIds),
        );
      } catch (error) {
        warnings.push(safeErrorMessage(error));
      }
    }

    const existingMetadataIds = new Set(
      (await this.database.noteReadingMetadata.toArray()).map(
        (metadata) => metadata.noteId,
      ),
    );
    const defaultMetadata = [...currentNotes.values()]
      .filter(
        (note) =>
          !existingMetadataIds.has(note.id) &&
          !remoteActiveMetadataIds.has(note.id),
      )
      .map((note) => createDefaultReadingMetadata(note.id, note.createdAt));

    this.assertCurrent(generation);
    await this.database.transaction(
      "rw",
      this.database.books,
      this.database.bookNotes,
      this.database.noteReadingMetadata,
      this.database.images,
      this.database.syncQueue,
      async () => {
        for (const bookId of preparedBooks.bookIdsToDelete) {
          const notes = await this.database.bookNotes
            .where("bookId")
            .equals(bookId)
            .toArray();
          await this.database.bookNotes.bulkDelete(notes.map((note) => note.id));
          await this.database.noteReadingMetadata.bulkDelete(
            notes.map((note) => note.id),
          );
          await this.database.syncQueue.bulkDelete(
            notes.map((note) =>
              syncQueueKey("noteReadingMetadata", note.id),
            ),
          );
          await this.database.books.delete(bookId);
          await this.database.syncQueue.delete(syncQueueKey("book", bookId));
        }
        if (preparedBooks.oldImageIdsToDelete.length > 0) {
          await this.database.images.bulkDelete(
            preparedBooks.oldImageIdsToDelete,
          );
        }
        if (preparedBooks.imagesToPut.length > 0) {
          await this.database.images.bulkPut(preparedBooks.imagesToPut);
        }
        if (preparedBooks.booksToPut.length > 0) {
          await this.database.books.bulkPut(preparedBooks.booksToPut);
        }
        if (noteIdsToDelete.length > 0) {
          await this.database.bookNotes.bulkDelete(noteIdsToDelete);
          await this.database.noteReadingMetadata.bulkDelete(noteIdsToDelete);
          await this.database.syncQueue.bulkDelete(
            noteIdsToDelete.flatMap((id) => [
              syncQueueKey("bookNote", id),
              syncQueueKey("noteReadingMetadata", id),
            ]),
          );
        }
        if (notesToPut.length > 0) {
          await this.database.bookNotes.bulkPut(notesToPut);
        }
        if (readingMetadataIdsToDelete.length > 0) {
          await this.database.noteReadingMetadata.bulkDelete(
            readingMetadataIdsToDelete,
          );
          await this.database.syncQueue.bulkDelete(
            readingMetadataIdsToDelete.map((id) =>
              syncQueueKey("noteReadingMetadata", id),
            ),
          );
        }
        if (readingMetadataToPut.length > 0) {
          await this.database.noteReadingMetadata.bulkPut(
            readingMetadataToPut,
          );
        }
        for (const metadata of defaultMetadata) {
          const note = currentNotes.get(metadata.noteId);
          if (!note) continue;
          await this.database.noteReadingMetadata.put(metadata);
          await enqueueSyncOperation(
            this.database,
            "noteReadingMetadata",
            metadata.noteId,
            "upsert",
            note.bookId,
            metadata.updatedAt,
          );
        }
      },
    );

    return {
      books:
        preparedBooks.booksToPut.length +
        preparedBooks.bookIdsToDelete.length,
      notes: notesToPut.length + noteIdsToDelete.length,
      warnings,
    };
  }

  private async createSafetyBackup(
    reason: LocalSafetyBackup["reason"],
  ): Promise<LocalSafetyBackup> {
    const [books, notes, noteReadingMetadata] = await Promise.all([
      this.database.books.toArray(),
      this.database.bookNotes.toArray(),
      this.database.noteReadingMetadata.toArray(),
    ]);
    const backup: LocalSafetyBackup = {
      id: createEntityId(),
      createdAt: new Date().toISOString(),
      reason,
      schemaVersion: 2,
      books,
      notes,
      noteReadingMetadata,
      coverImageIds: books.flatMap((book) =>
        book.coverImageId ? [book.coverImageId] : [],
      ),
    };
    await this.database.localSafetyBackups.add(backup);
    return backup;
  }

  private async completeFirstSync(
    userId: UUID,
    changes: Partial<SyncMetadata> = {},
  ): Promise<void> {
    await updateSyncMetadata(this.database, {
      associatedUserId: userId,
      firstSyncCompleted: true,
      ...changes,
    });
    emitSyncStatusChanged();
  }

  async enableEmptyBackup(userId: UUID): Promise<void> {
    await this.ensureAccountAllowed(userId);
    await this.completeFirstSync(userId, {
      lastSuccessfulSyncAt: new Date().toISOString(),
    });
  }

  async clearLocalDataForNewAccount(
    userId: UUID,
    confirmed = false,
  ): Promise<void> {
    if (!confirmed) {
      throw new SyncServiceError(
        "account_mismatch",
        "Le changement de compte doit être confirmé explicitement.",
      );
    }
    this.cancelCurrentSync();
    const localCount =
      (await this.database.books.count()) +
      (await this.database.bookNotes.count());
    if (localCount > 0) await this.createSafetyBackup("account_change");
    await this.database.transaction(
      "rw",
      [
        this.database.books,
        this.database.bookNotes,
        this.database.noteReadingMetadata,
        this.database.images,
        this.database.syncQueue,
        this.database.syncMetadata,
      ],
      async () => {
        await this.database.bookNotes.clear();
        await this.database.noteReadingMetadata.clear();
        await this.database.books.clear();
        await this.database.images.clear();
        await this.database.syncQueue.clear();
        const metadata = await getOrCreateSyncMetadata(this.database);
        await this.database.syncMetadata.put({
          ...metadata,
          associatedUserId: userId,
          firstSyncCompleted: false,
          lastPushAt: null,
          lastPullAt: null,
          lastSuccessfulSyncAt: null,
          lastRestoreAt: null,
        });
      },
    );
    emitSyncStatusChanged();
  }

  async backupLocalData(userId: UUID): Promise<SyncRunResult> {
    return this.withLock(async (generation) => {
      await this.ensureAccountAllowed(userId);
      const client = await this.requireAuthenticatedClient(userId);
      await updateSyncMetadata(this.database, { associatedUserId: userId });
      await this.seedFullBackupQueue();
      const pushed = await this.processQueue(client, userId, generation);
      if (pushed.failed > 0) {
        throw new SyncServiceError(
          "remote",
          "Certaines données n’ont pas pu être sauvegardées. Elles restent dans la file d’attente.",
        );
      }
      const now = new Date().toISOString();
      await this.completeFirstSync(userId, {
        lastPushAt: now,
        lastSuccessfulSyncAt: now,
      });
      return {
        pushed: pushed.pushed,
        pulledBooks: 0,
        pulledNotes: 0,
        warnings: [],
      };
    });
  }

  async restoreFromCloud(
    userId: UUID,
    confirmed = false,
  ): Promise<SyncRunResult> {
    if (!confirmed) {
      throw new SyncServiceError(
        "not_initialized",
        "La restauration doit être confirmée explicitement.",
      );
    }
    return this.withLock(async (generation) => {
      await this.ensureAccountAllowed(userId);
      const client = await this.requireAuthenticatedClient(userId);
      const remote = await this.fetchRemoteSnapshot(client, userId);
      this.assertCurrent(generation);
      const activeBooks = remote.books.filter((row) => !row.deleted_at);
      const activeBookIds = new Set(
        activeBooks.map((row) => row.id as UUID),
      );
      const restoredBooks: Book[] = [];
      const restoredImages: StoredImage[] = [];
      const warnings: string[] = [];

      for (const row of activeBooks) {
        let coverImageId: UUID | null = null;
        if (row.cover_storage_path) {
          try {
            coverImageId = parseCoverStoragePath(
              row.cover_storage_path,
              userId,
              row.id as UUID,
            );
            restoredImages.push(
              await downloadCover(
                client,
                row.cover_storage_path,
                coverImageId,
                row.updated_at,
              ),
            );
          } catch {
            coverImageId = null;
            warnings.push(
              `La couverture du livre ${row.id} n’a pas pu être restaurée.`,
            );
          }
        }
        try {
          restoredBooks.push(
            remoteBookToLocal(row, userId, coverImageId),
          );
        } catch (error) {
          warnings.push(safeErrorMessage(error));
        }
      }
      const validBookIds = new Set(restoredBooks.map((book) => book.id));
      const restoredNotes: BookNote[] = [];
      for (const row of remote.notes.filter((note) => !note.deleted_at)) {
        if (!activeBookIds.has(row.book_id as UUID)) continue;
        try {
          restoredNotes.push(remoteNoteToLocal(row, userId, validBookIds));
        } catch (error) {
          warnings.push(safeErrorMessage(error));
        }
      }
      const restoredNoteIds = new Set(restoredNotes.map((note) => note.id));
      const restoredReadingMetadata: NoteReadingMetadata[] = [];
      for (const row of remote.noteReadingMetadata.filter(
        (metadata) => !metadata.deleted_at,
      )) {
        try {
          restoredReadingMetadata.push(
            remoteNoteReadingMetadataToLocal(row, userId, restoredNoteIds),
          );
        } catch (error) {
          warnings.push(safeErrorMessage(error));
        }
      }
      const restoredMetadataIds = new Set(
        restoredReadingMetadata.map((metadata) => metadata.noteId),
      );
      const metadataDefaultsToUpload: NoteReadingMetadata[] = [];
      for (const note of restoredNotes) {
        if (!restoredMetadataIds.has(note.id)) {
          const metadata = createDefaultReadingMetadata(
            note.id,
            note.createdAt,
          );
          restoredReadingMetadata.push(metadata);
          metadataDefaultsToUpload.push(metadata);
        }
      }
      this.assertCurrent(generation);
      const localCount =
        (await this.database.books.count()) +
        (await this.database.bookNotes.count());
      if (localCount > 0) await this.createSafetyBackup("restore");

      const now = new Date().toISOString();
      await this.database.transaction(
        "rw",
        [
          this.database.books,
          this.database.bookNotes,
          this.database.noteReadingMetadata,
          this.database.images,
          this.database.syncQueue,
          this.database.syncMetadata,
        ],
        async () => {
          await this.database.bookNotes.clear();
          await this.database.noteReadingMetadata.clear();
          await this.database.books.clear();
          await this.database.images.clear();
          await this.database.syncQueue.clear();
          if (restoredImages.length > 0) {
            await this.database.images.bulkAdd(restoredImages);
          }
          if (restoredBooks.length > 0) {
            await this.database.books.bulkAdd(restoredBooks);
          }
          if (restoredNotes.length > 0) {
            await this.database.bookNotes.bulkAdd(restoredNotes);
          }
          if (restoredReadingMetadata.length > 0) {
            await this.database.noteReadingMetadata.bulkAdd(
              restoredReadingMetadata,
            );
          }
          for (const metadata of metadataDefaultsToUpload) {
            const note = restoredNotes.find(
              (candidate) => candidate.id === metadata.noteId,
            );
            if (!note) continue;
            await enqueueSyncOperation(
              this.database,
              "noteReadingMetadata",
              metadata.noteId,
              "upsert",
              note.bookId,
              metadata.updatedAt,
            );
          }
          await updateSyncMetadata(this.database, {
            associatedUserId: userId,
            firstSyncCompleted: true,
            lastPullAt: now,
            lastRestoreAt: now,
            lastSuccessfulSyncAt: now,
          });
        },
      );
      emitSyncStatusChanged();
      return {
        pushed: 0,
        pulledBooks: restoredBooks.length,
        pulledNotes: restoredNotes.length,
        warnings,
      };
    });
  }

  async mergeLibraries(userId: UUID): Promise<SyncRunResult> {
    return this.withLock(async (generation) => {
      await this.ensureAccountAllowed(userId);
      const client = await this.requireAuthenticatedClient(userId);
      await this.createSafetyBackup("merge");
      await updateSyncMetadata(this.database, { associatedUserId: userId });
      const pulled = await this.pullRemoteChangesInternal(
        client,
        userId,
        generation,
        true,
      );
      await this.seedFullBackupQueue();
      const pushed = await this.processQueue(client, userId, generation);
      if (pushed.failed > 0) {
        throw new SyncServiceError(
          "remote",
          "La fusion est conservée localement, mais certaines données attendent encore leur sauvegarde.",
        );
      }
      const now = new Date().toISOString();
      await this.completeFirstSync(userId, {
        lastPushAt: now,
        lastPullAt: now,
        lastSuccessfulSyncAt: now,
      });
      return {
        pushed: pushed.pushed,
        pulledBooks: pulled.books,
        pulledNotes: pulled.notes,
        warnings: pulled.warnings,
      };
    });
  }

  async replaceCloudWithLocal(
    userId: UUID,
    confirmed = false,
  ): Promise<SyncRunResult> {
    if (!confirmed) {
      throw new SyncServiceError(
        "not_initialized",
        "Le remplacement du cloud doit être confirmé explicitement.",
      );
    }
    return this.withLock(async (generation) => {
      await this.ensureAccountAllowed(userId);
      const client = await this.requireAuthenticatedClient(userId);
      const remote = await this.fetchRemoteSnapshot(client, userId);
      const [localBooks, localNotes, localReadingMetadata] = await Promise.all([
        this.database.books.toArray(),
        this.database.bookNotes.toArray(),
        this.database.noteReadingMetadata.toArray(),
      ]);
      const localBookIds = new Set(localBooks.map((book) => book.id));
      const localNoteIds = new Set(localNotes.map((note) => note.id));
      const localReadingMetadataIds = new Set(
        localReadingMetadata.map((metadata) => metadata.noteId),
      );
      const deletedAt = new Date().toISOString();

      for (const row of remote.noteReadingMetadata) {
        this.assertCurrent(generation);
        if (
          !row.deleted_at &&
          !localReadingMetadataIds.has(row.note_id as UUID)
        ) {
          const { error } = await client
            .from("note_reading_metadata")
            .update({ deleted_at: deletedAt })
            .eq("user_id", userId)
            .eq("note_id", row.note_id);
          if (error) throw error;
        }
      }
      for (const row of remote.notes) {
        this.assertCurrent(generation);
        if (!row.deleted_at && !localNoteIds.has(row.id as UUID)) {
          const { error } = await client
            .from("book_notes")
            .update({ deleted_at: deletedAt })
            .eq("user_id", userId)
            .eq("id", row.id);
          if (error) throw error;
        }
      }
      for (const row of remote.books) {
        this.assertCurrent(generation);
        if (!row.deleted_at && !localBookIds.has(row.id as UUID)) {
          const { error } = await client
            .from("books")
            .update({ deleted_at: deletedAt })
            .eq("user_id", userId)
            .eq("id", row.id);
          if (error) throw error;
          if (row.cover_storage_path) {
            await deleteCover(client, row.cover_storage_path);
          }
        }
      }

      await updateSyncMetadata(this.database, { associatedUserId: userId });
      await this.seedFullBackupQueue();
      const pushed = await this.processQueue(client, userId, generation);
      if (pushed.failed > 0) {
        throw new SyncServiceError(
          "remote",
          "Le cloud a été préparé, mais certaines données locales restent en attente.",
        );
      }
      const now = new Date().toISOString();
      await this.completeFirstSync(userId, {
        lastPushAt: now,
        lastSuccessfulSyncAt: now,
      });
      return {
        pushed: pushed.pushed,
        pulledBooks: 0,
        pulledNotes: 0,
        warnings: [],
      };
    });
  }

  async pushLocalChanges(userId: UUID): Promise<SyncRunResult> {
    return this.withLock(async (generation) => {
      const metadata = await this.ensureAccountAllowed(userId);
      if (!metadata.firstSyncCompleted) {
        throw new SyncServiceError(
          "not_initialized",
          "Choisissez d’abord la stratégie de première sauvegarde.",
        );
      }
      const client = await this.requireAuthenticatedClient(userId);
      const pushed = await this.processQueue(client, userId, generation);
      const now = new Date().toISOString();
      await updateSyncMetadata(this.database, {
        lastPushAt: pushed.failed === 0 ? now : metadata.lastPushAt,
        lastSuccessfulSyncAt:
          pushed.failed === 0 ? now : metadata.lastSuccessfulSyncAt,
      });
      return {
        pushed: pushed.pushed,
        pulledBooks: 0,
        pulledNotes: 0,
        warnings: [],
      };
    });
  }

  async pullRemoteChanges(userId: UUID): Promise<SyncRunResult> {
    return this.withLock(async (generation) => {
      const metadata = await this.ensureAccountAllowed(userId);
      if (!metadata.firstSyncCompleted) {
        throw new SyncServiceError(
          "not_initialized",
          "Choisissez d’abord la stratégie de première sauvegarde.",
        );
      }
      const client = await this.requireAuthenticatedClient(userId);
      const pulled = await this.pullRemoteChangesInternal(
        client,
        userId,
        generation,
      );
      const now = new Date().toISOString();
      await updateSyncMetadata(this.database, {
        lastPullAt: now,
        lastSuccessfulSyncAt: now,
      });
      return {
        pushed: 0,
        pulledBooks: pulled.books,
        pulledNotes: pulled.notes,
        warnings: pulled.warnings,
      };
    });
  }

  async runFullSync(userId: UUID): Promise<SyncRunResult> {
    return this.withLock(async (generation) => {
      const metadata = await this.ensureAccountAllowed(userId);
      if (!metadata.firstSyncCompleted) {
        throw new SyncServiceError(
          "not_initialized",
          "Choisissez d’abord la stratégie de première sauvegarde.",
        );
      }
      const client = await this.requireAuthenticatedClient(userId);
      const pushed = await this.processQueue(client, userId, generation);
      const pulled = await this.pullRemoteChangesInternal(
        client,
        userId,
        generation,
      );
      const now = new Date().toISOString();
      await updateSyncMetadata(this.database, {
        lastPushAt: pushed.failed === 0 ? now : metadata.lastPushAt,
        lastPullAt: now,
        lastSuccessfulSyncAt:
          pushed.failed === 0 ? now : metadata.lastSuccessfulSyncAt,
      });
      return {
        pushed: pushed.pushed,
        pulledBooks: pulled.books,
        pulledNotes: pulled.notes,
        warnings: pulled.warnings,
      };
    });
  }

  async retryFailedOperations(userId: UUID): Promise<SyncRunResult> {
    await retryFailedSyncOperations(this.database);
    emitSyncStatusChanged();
    return this.runFullSync(userId);
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const metadata = await getOrCreateSyncMetadata(this.database);
    const [pendingCount, failedCount] = await Promise.all([
      this.database.syncQueue
        .where("status")
        .anyOf("pending", "processing")
        .count(),
      this.database.syncQueue.where("status").equals("failed").count(),
    ]);
    return {
      configured: supabaseConfiguration.configured,
      online: isOnline(),
      running: Boolean(this.currentRun),
      pendingCount,
      failedCount,
      lastPushAt: metadata.lastPushAt,
      lastPullAt: metadata.lastPullAt,
      lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
      lastRestoreAt: metadata.lastRestoreAt,
      firstSyncCompleted: metadata.firstSyncCompleted,
      associatedUserId: metadata.associatedUserId,
    };
  }
}

export const syncService = new SyncService(
  brainBookDatabase,
  getSupabaseClient,
  () => supabaseConfiguration.configured,
);
