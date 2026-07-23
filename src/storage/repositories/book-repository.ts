import type {
  Book,
  BookInput,
  PreparedImage,
  UUID,
} from "@/domain/models";
import { createEntityId } from "@/domain/id";
import { normalizeBookText } from "@/domain/book-validation";
import {
  brainBookDatabase,
  type BrainBookDatabase,
} from "@/storage/database";
import { normalizeStorageError } from "@/storage/errors";
import { ImageRepository } from "@/storage/repositories/image-repository";

export type CoverMutation =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "replace"; image: PreparedImage };

function normalizeInput(input: BookInput): BookInput {
  return {
    ...input,
    title: normalizeBookText(input.title),
    author: normalizeBookText(input.author),
  };
}

export class BookRepository {
  private readonly images: ImageRepository;

  constructor(private readonly database: BrainBookDatabase) {
    this.images = new ImageRepository(database);
  }

  async list(): Promise<Book[]> {
    try {
      return await this.database.books.orderBy("updatedAt").reverse().toArray();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async get(id: string): Promise<Book | undefined> {
    try {
      return await this.database.books.get(id as UUID);
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async create(input: BookInput, cover?: PreparedImage): Promise<Book> {
    try {
      return await this.database.transaction(
        "rw",
        this.database.books,
        this.database.images,
        async () => {
          const timestamp = new Date().toISOString();
          const storedImage = cover
            ? await this.images.create(cover, timestamp)
            : null;
          const book: Book = {
            ...normalizeInput(input),
            id: createEntityId(),
            coverImageId: storedImage?.id ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          await this.database.books.add(book);
          return book;
        },
      );
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async update(
    id: string,
    input: BookInput,
    coverMutation: CoverMutation = { kind: "keep" },
  ): Promise<Book | undefined> {
    try {
      return await this.database.transaction(
        "rw",
        this.database.books,
        this.database.images,
        async () => {
          const existing = await this.database.books.get(id as UUID);
          if (!existing) return undefined;

          const timestamp = new Date().toISOString();
          let nextCoverId = existing.coverImageId;

          if (coverMutation.kind === "replace") {
            const replacement = await this.images.create(
              coverMutation.image,
              timestamp,
            );
            nextCoverId = replacement.id;
          } else if (coverMutation.kind === "remove") {
            nextCoverId = null;
          }

          const updated: Book = {
            ...existing,
            ...normalizeInput(input),
            coverImageId: nextCoverId,
            updatedAt: timestamp,
          };

          await this.database.books.put(updated);

          if (
            existing.coverImageId &&
            existing.coverImageId !== nextCoverId
          ) {
            await this.images.delete(existing.coverImageId);
          }

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
        this.database.books,
        this.database.images,
        this.database.bookNotes,
        async () => {
          const book = await this.database.books.get(id as UUID);
          if (!book) return false;

          const notes = await this.database.bookNotes
            .where("bookId")
            .equals(book.id)
            .toArray();
          const imageIds = new Set<UUID>();
          if (book.coverImageId) imageIds.add(book.coverImageId);
          for (const note of notes) {
            if (note.sourceImageId) imageIds.add(note.sourceImageId);
          }

          await this.database.bookNotes.bulkDelete(
            notes.map((note) => note.id),
          );
          await this.database.books.delete(book.id);
          if (imageIds.size > 0) {
            await this.database.images.bulkDelete([...imageIds]);
          }

          return true;
        },
      );
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }
}

export const bookRepository = new BookRepository(brainBookDatabase);
export const imageRepository = new ImageRepository(brainBookDatabase);
