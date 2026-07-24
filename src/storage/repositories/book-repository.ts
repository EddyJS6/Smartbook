import type {
  Book,
  BookInput,
  PreparedImage,
  UUID,
  VideoInput,
} from "@/domain/models";
import { createEntityId } from "@/domain/id";
import { normalizeBookText } from "@/domain/book-validation";
import {
  canonicalYouTubeUrl,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
} from "@/domain/youtube-video";
import {
  brainBookDatabase,
  type BrainBookDatabase,
} from "@/storage/database";
import {
  BrainBookStorageError,
  normalizeStorageError,
} from "@/storage/errors";
import { ImageRepository } from "@/storage/repositories/image-repository";
import {
  enqueueSyncOperation,
  notifyLocalMutation,
} from "@/sync/queue";

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
      const created = await this.database.transaction(
        "rw",
        this.database.books,
        this.database.images,
        this.database.syncQueue,
        async () => {
          const timestamp = new Date().toISOString();
          const storedImage = cover
            ? await this.images.create(cover, timestamp)
            : null;
          const book: Book = {
            ...normalizeInput(input),
            id: createEntityId(),
            contentType: "book",
            coverImageId: storedImage?.id ?? null,
            youtubeUrl: null,
            youtubeVideoId: null,
            thumbnailUrl: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          await this.database.books.add(book);
          if (storedImage) {
            await enqueueSyncOperation(
              this.database,
              "coverImage",
              storedImage.id,
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
          return book;
        },
      );
      notifyLocalMutation();
      return created;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async createVideo(input: VideoInput): Promise<Book> {
    try {
      const parsedVideoId = parseYouTubeVideoId(input.youtubeUrl);
      const title = normalizeBookText(input.title).slice(0, 500);
      const author = normalizeBookText(input.author).slice(0, 300);
      if (
        !title ||
        !author ||
        !parsedVideoId ||
        parsedVideoId !== input.youtubeVideoId
      ) {
        throw new BrainBookStorageError(
          "validation",
          "Les informations de cette vidéo YouTube sont invalides.",
        );
      }
      const timestamp = new Date().toISOString();
      const video: Book = {
        id: createEntityId(),
        contentType: "video",
        title,
        author,
        coverImageId: null,
        youtubeUrl: canonicalYouTubeUrl(parsedVideoId),
        youtubeVideoId: parsedVideoId,
        thumbnailUrl: youtubeThumbnailUrl(parsedVideoId),
        status: "to_read",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.database.transaction(
        "rw",
        this.database.books,
        this.database.syncQueue,
        async () => {
          await this.database.books.add(video);
          await enqueueSyncOperation(
            this.database,
            "book",
            video.id,
            "upsert",
            null,
            timestamp,
          );
        },
      );
      notifyLocalMutation();
      return video;
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
      const updated = await this.database.transaction(
        "rw",
        this.database.books,
        this.database.images,
        this.database.syncQueue,
        async () => {
          const existing = await this.database.books.get(id as UUID);
          if (!existing) return undefined;
          if (existing.contentType === "video") {
            throw new Error(
              "Une vidéo ne peut pas être modifiée avec le formulaire de livre.",
            );
          }

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
            coverMutation.kind === "replace" &&
            updated.coverImageId
          ) {
            await enqueueSyncOperation(
              this.database,
              "coverImage",
              updated.coverImageId,
              "upsert",
              updated.id,
              timestamp,
            );
          }

          if (
            existing.coverImageId &&
            existing.coverImageId !== nextCoverId
          ) {
            await enqueueSyncOperation(
              this.database,
              "coverImage",
              existing.coverImageId,
              "delete",
              existing.id,
              timestamp,
            );
            await this.images.delete(existing.coverImageId);
          }

          await enqueueSyncOperation(
            this.database,
            "book",
            updated.id,
            "upsert",
            null,
            timestamp,
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
        this.database.books,
        this.database.images,
        this.database.bookNotes,
        this.database.noteReadingMetadata,
        this.database.syncQueue,
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
            await enqueueSyncOperation(
              this.database,
              "bookNote",
              note.id,
              "delete",
              book.id,
            );
            await enqueueSyncOperation(
              this.database,
              "noteReadingMetadata",
              note.id,
              "delete",
              book.id,
            );
          }
          if (book.coverImageId) {
            await enqueueSyncOperation(
              this.database,
              "coverImage",
              book.coverImageId,
              "delete",
              book.id,
            );
          }
          await enqueueSyncOperation(
            this.database,
            "book",
            book.id,
            "delete",
          );

          await this.database.bookNotes.bulkDelete(
            notes.map((note) => note.id),
          );
          await this.database.noteReadingMetadata.bulkDelete(
            notes.map((note) => note.id),
          );
          await this.database.books.delete(book.id);
          if (imageIds.size > 0) {
            await this.database.images.bulkDelete([...imageIds]);
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
}

export const bookRepository = new BookRepository(brainBookDatabase);
export const imageRepository = new ImageRepository(brainBookDatabase);
