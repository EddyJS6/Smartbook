import type {
  NoteReadingMetadata,
  UUID,
} from "@/domain/models";
import {
  brainBookDatabase,
  type BrainBookDatabase,
} from "@/storage/database";
import { normalizeStorageError } from "@/storage/errors";
import {
  enqueueSyncOperation,
  notifyLocalMutation,
} from "@/sync/queue";

export function createDefaultReadingMetadata(
  noteId: UUID,
  timestamp = new Date().toISOString(),
): NoteReadingMetadata {
  return {
    noteId,
    isFavorite: false,
    isImportant: false,
    favoriteIndex: 0,
    importantIndex: 0,
    lastReadAt: null,
    readCount: 0,
    lastSuggestedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function emitReadingMetadataChanged(noteId: UUID): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("brainbook:reading-metadata", { detail: { noteId } }),
    );
  }
  notifyLocalMutation();
}

export class NoteReadingMetadataRepository {
  constructor(private readonly database: BrainBookDatabase) {}

  async get(noteId: string): Promise<NoteReadingMetadata | undefined> {
    try {
      return await this.database.noteReadingMetadata.get(noteId as UUID);
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async getOrCreate(noteId: string): Promise<NoteReadingMetadata> {
    try {
      const id = noteId as UUID;
      const existing = await this.database.noteReadingMetadata.get(id);
      if (existing) return existing;
      const note = await this.database.bookNotes.get(id);
      if (!note) {
        throw new Error("La note associée aux métadonnées n’existe plus.");
      }
      const metadata = createDefaultReadingMetadata(id, note.createdAt);
      await this.database.transaction(
        "rw",
        this.database.noteReadingMetadata,
        this.database.syncQueue,
        async () => {
          await this.database.noteReadingMetadata.put(metadata);
          await enqueueSyncOperation(
            this.database,
            "noteReadingMetadata",
            id,
            "upsert",
            note.bookId,
            metadata.updatedAt,
          );
        },
      );
      emitReadingMetadataChanged(id);
      return metadata;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async listAll(): Promise<NoteReadingMetadata[]> {
    try {
      return await this.database.noteReadingMetadata.toArray();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  private async update(
    noteId: UUID,
    change: (
      current: NoteReadingMetadata,
      timestamp: string,
    ) => NoteReadingMetadata,
  ): Promise<NoteReadingMetadata> {
    const timestamp = new Date().toISOString();
    try {
      const updated = await this.database.transaction(
        "rw",
        this.database.bookNotes,
        this.database.noteReadingMetadata,
        this.database.syncQueue,
        async () => {
          const note = await this.database.bookNotes.get(noteId);
          if (!note) throw new Error("Cette note n’existe plus.");
          const current =
            (await this.database.noteReadingMetadata.get(noteId)) ??
            createDefaultReadingMetadata(noteId, note.createdAt);
          const next = change(current, timestamp);
          await this.database.noteReadingMetadata.put(next);
          await enqueueSyncOperation(
            this.database,
            "noteReadingMetadata",
            noteId,
            "upsert",
            note.bookId,
            timestamp,
          );
          return next;
        },
      );
      emitReadingMetadataChanged(noteId);
      return updated;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async setFavorite(noteId: UUID, value: boolean) {
    return this.update(noteId, (current, updatedAt) => ({
      ...current,
      isFavorite: value,
      favoriteIndex: value ? 1 : 0,
      updatedAt,
    }));
  }

  async setImportant(noteId: UUID, value: boolean) {
    return this.update(noteId, (current, updatedAt) => ({
      ...current,
      isImportant: value,
      importantIndex: value ? 1 : 0,
      updatedAt,
    }));
  }

  async recordRead(noteId: UUID) {
    return this.update(noteId, (current, updatedAt) => ({
      ...current,
      lastReadAt: updatedAt,
      readCount: Math.max(0, current.readCount) + 1,
      updatedAt,
    }));
  }

  async recordSuggested(noteId: UUID) {
    return this.update(noteId, (current, updatedAt) => ({
      ...current,
      lastSuggestedAt: updatedAt,
      updatedAt,
    }));
  }

  async listFavorites() {
    return this.database.noteReadingMetadata
      .where("favoriteIndex")
      .equals(1)
      .toArray();
  }

  async listImportant() {
    return this.database.noteReadingMetadata
      .where("importantIndex")
      .equals(1)
      .toArray();
  }

  async listLeastRecentlyRead() {
    const all = await this.listAll();
    return all.sort((left, right) => {
      if (!left.lastReadAt) return right.lastReadAt ? -1 : 0;
      if (!right.lastReadAt) return 1;
      return Date.parse(left.lastReadAt) - Date.parse(right.lastReadAt);
    });
  }

  async delete(noteId: UUID): Promise<void> {
    await this.database.noteReadingMetadata.delete(noteId);
  }
}

export const noteReadingMetadataRepository =
  new NoteReadingMetadataRepository(brainBookDatabase);
