import type {
  BookNote,
  BookNoteInput,
  NoteSourceType,
  UUID,
} from "@/domain/models";
import { createEntityId } from "@/domain/id";
import {
  normalizeNoteTitle,
  normalizeMultilineText,
  normalizePageReference,
  normalizeTags,
} from "@/domain/note-validation";
import {
  brainBookDatabase,
  type BrainBookDatabase,
} from "@/storage/database";
import {
  BrainBookStorageError,
  normalizeStorageError,
} from "@/storage/errors";
import {
  enqueueSyncOperation,
  notifyLocalMutation,
} from "@/sync/queue";
import { NoteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";

function normalizeInput(input: BookNoteInput): BookNoteInput {
  return {
    title: normalizeNoteTitle(input.title ?? ""),
    extractedText: normalizeMultilineText(input.extractedText),
    personalReflection: normalizeMultilineText(input.personalReflection),
    pageNumber: normalizePageReference(input.pageNumber ?? ""),
    tags: normalizeTags(input.tags),
  };
}

export class NoteRepository {
  constructor(private readonly database: BrainBookDatabase) {}

  async create(
    bookId: string,
    input: BookNoteInput,
    sourceType: NoteSourceType = "manual",
  ): Promise<BookNote> {
    try {
      const created = await this.database.transaction(
        "rw",
        this.database.books,
        this.database.bookNotes,
        this.database.syncQueue,
        async () => {
          const book = await this.database.books.get(bookId as UUID);
          if (!book) {
            throw new BrainBookStorageError(
              "not_found",
              "Ce contenu n’existe plus dans votre bibliothèque.",
            );
          }
          if (sourceType === "scan" && book.contentType === "video") {
            throw new BrainBookStorageError(
              "validation",
              "Le scanner n’est pas disponible pour les vidéos.",
            );
          }

          const timestamp = new Date().toISOString();
          const note: BookNote = {
            ...normalizeInput(input),
            id: createEntityId(),
            bookId: book.id,
            sourceType,
            sourceImageId: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          await this.database.bookNotes.add(note);
          await enqueueSyncOperation(
            this.database,
            "bookNote",
            note.id,
            "upsert",
            note.bookId,
            timestamp,
          );
          return note;
        },
      );
      notifyLocalMutation();
      try {
        await new NoteReadingMetadataRepository(
          this.database,
        ).getOrCreate(created.id);
      } catch {
        // La note est acquise. Les métadonnées seront recréées paresseusement.
      }
      return created;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async get(id: string): Promise<BookNote | undefined> {
    try {
      return await this.database.bookNotes.get(id as UUID);
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async listByBook(bookId: string): Promise<BookNote[]> {
    try {
      const notes = await this.database.bookNotes
        .where("bookId")
        .equals(bookId)
        .sortBy("updatedAt");
      return notes.reverse();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async listAll(): Promise<BookNote[]> {
    try {
      return await this.database.bookNotes
        .orderBy("updatedAt")
        .reverse()
        .toArray();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async update(
    id: string,
    input: BookNoteInput,
  ): Promise<BookNote | undefined> {
    try {
      const updated = await this.database.transaction(
        "rw",
        this.database.books,
        this.database.bookNotes,
        this.database.syncQueue,
        async () => {
          const existing = await this.database.bookNotes.get(id as UUID);
          if (!existing) return undefined;

          const book = await this.database.books.get(existing.bookId);
          if (!book) {
            throw new BrainBookStorageError(
              "not_found",
              "Le contenu associé à cette note n’existe plus.",
            );
          }

          const updated: BookNote = {
            ...existing,
            ...normalizeInput(input),
            updatedAt: new Date().toISOString(),
          };

          await this.database.bookNotes.put(updated);
          await enqueueSyncOperation(
            this.database,
            "bookNote",
            updated.id,
            "upsert",
            updated.bookId,
            updated.updatedAt,
          );
          return updated;
        },
      );
      if (updated) notifyLocalMutation();
      return updated;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.database.transaction(
        "rw",
        this.database.bookNotes,
        this.database.images,
        this.database.noteReadingMetadata,
        this.database.syncQueue,
        async () => {
          const note = await this.database.bookNotes.get(id as UUID);
          if (!note) return false;

          await enqueueSyncOperation(
            this.database,
            "bookNote",
            note.id,
            "delete",
            note.bookId,
          );
          await enqueueSyncOperation(
            this.database,
            "noteReadingMetadata",
            note.id,
            "delete",
            note.bookId,
          );
          await this.database.bookNotes.delete(note.id);
          await this.database.noteReadingMetadata.delete(note.id);
          if (note.sourceImageId) {
            await this.database.images.delete(note.sourceImageId);
          }
          return true;
        },
      );
      if (deleted) notifyLocalMutation();
      return deleted;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async deleteByBook(bookId: string): Promise<number> {
    try {
      const deletedCount = await this.database.transaction(
        "rw",
        this.database.bookNotes,
        this.database.images,
        this.database.noteReadingMetadata,
        this.database.syncQueue,
        async () => {
          const notes = await this.database.bookNotes
            .where("bookId")
            .equals(bookId)
            .toArray();
          const sourceImageIds = notes.flatMap((note) =>
            note.sourceImageId ? [note.sourceImageId] : [],
          );

          for (const note of notes) {
            await enqueueSyncOperation(
              this.database,
              "bookNote",
              note.id,
              "delete",
              note.bookId,
            );
            await enqueueSyncOperation(
              this.database,
              "noteReadingMetadata",
              note.id,
              "delete",
              note.bookId,
            );
          }
          await this.database.bookNotes.bulkDelete(
            notes.map((note) => note.id),
          );
          await this.database.noteReadingMetadata.bulkDelete(
            notes.map((note) => note.id),
          );
          if (sourceImageIds.length > 0) {
            await this.database.images.bulkDelete(sourceImageIds);
          }
          return notes.length;
        },
      );
      if (deletedCount > 0) notifyLocalMutation();
      return deletedCount;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async countByBook(bookId: string): Promise<number> {
    try {
      return await this.database.bookNotes
        .where("bookId")
        .equals(bookId)
        .count();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }
}

export const noteRepository = new NoteRepository(brainBookDatabase);
