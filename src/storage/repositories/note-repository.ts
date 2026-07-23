import type {
  BookNote,
  BookNoteInput,
  NoteSourceType,
  UUID,
} from "@/domain/models";
import { createEntityId } from "@/domain/id";
import {
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

function normalizeInput(input: BookNoteInput): BookNoteInput {
  return {
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
      return await this.database.transaction(
        "rw",
        this.database.books,
        this.database.bookNotes,
        async () => {
          const book = await this.database.books.get(bookId as UUID);
          if (!book) {
            throw new BrainBookStorageError(
              "not_found",
              "Ce livre n’existe plus dans votre bibliothèque.",
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
          return note;
        },
      );
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
      return await this.database.transaction(
        "rw",
        this.database.books,
        this.database.bookNotes,
        async () => {
          const existing = await this.database.bookNotes.get(id as UUID);
          if (!existing) return undefined;

          const book = await this.database.books.get(existing.bookId);
          if (!book) {
            throw new BrainBookStorageError(
              "not_found",
              "Le livre associé à cette note n’existe plus.",
            );
          }

          const updated: BookNote = {
            ...existing,
            ...normalizeInput(input),
            updatedAt: new Date().toISOString(),
          };

          await this.database.bookNotes.put(updated);
          return updated;
        },
      );
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      return await this.database.transaction(
        "rw",
        this.database.bookNotes,
        this.database.images,
        async () => {
          const note = await this.database.bookNotes.get(id as UUID);
          if (!note) return false;

          await this.database.bookNotes.delete(note.id);
          if (note.sourceImageId) {
            await this.database.images.delete(note.sourceImageId);
          }
          return true;
        },
      );
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async deleteByBook(bookId: string): Promise<number> {
    try {
      return await this.database.transaction(
        "rw",
        this.database.bookNotes,
        this.database.images,
        async () => {
          const notes = await this.database.bookNotes
            .where("bookId")
            .equals(bookId)
            .toArray();
          const sourceImageIds = notes.flatMap((note) =>
            note.sourceImageId ? [note.sourceImageId] : [],
          );

          await this.database.bookNotes.bulkDelete(
            notes.map((note) => note.id),
          );
          if (sourceImageIds.length > 0) {
            await this.database.images.bulkDelete(sourceImageIds);
          }
          return notes.length;
        },
      );
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
