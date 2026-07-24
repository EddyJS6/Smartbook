export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export type BookStatus = "to_read" | "reading" | "finished";
export type LibraryContentType = "book" | "video";

export interface Book {
  id: UUID;
  /** Missing only on legacy in-memory fixtures; IndexedDB v5 materializes it. */
  contentType?: LibraryContentType;
  title: string;
  author: string;
  coverImageId: UUID | null;
  youtubeUrl?: string | null;
  youtubeVideoId?: string | null;
  thumbnailUrl?: string | null;
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredImage {
  id: UUID;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
}

export type NoteSourceType = "manual" | "scan" | "voice" | "import";

export type NoteTextSize = "small" | "normal" | "large";

export interface NoteTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: NoteTextSize;
}

export type NoteDocument = NoteTextRun[];

export interface BookNote {
  id: UUID;
  bookId: UUID;
  title?: string;
  /** Missing on notes created before IndexedDB v6. */
  formattedContent?: NoteDocument | null;
  extractedText: string;
  personalReflection: string;
  pageNumber: string | null;
  tags: string[];
  sourceType: NoteSourceType;
  sourceImageId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteReadingMetadata {
  noteId: UUID;
  isFavorite: boolean;
  isImportant: boolean;
  /** IndexedDB does not index boolean keys, so these numeric mirrors back local queries. */
  favoriteIndex: 0 | 1;
  importantIndex: 0 | 1;
  lastReadAt: string | null;
  readCount: number;
  lastSuggestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BookInput = Pick<Book, "title" | "author" | "status">;

export type VideoInput = Pick<
  Book,
  "title" | "author"
> & {
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnailUrl: string;
};

export type PreparedImage = Omit<StoredImage, "id" | "createdAt">;

export type BookNoteInput = Pick<
  BookNote,
  "extractedText" | "personalReflection" | "pageNumber" | "tags"
> & {
  title?: string;
  formattedContent?: NoteDocument | null;
};

export type NoteWithBook = {
  note: BookNote;
  book: Book;
  readingMetadata?: NoteReadingMetadata;
};
