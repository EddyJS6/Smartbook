export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export type BookStatus = "to_read" | "reading" | "finished";

export interface Book {
  id: UUID;
  title: string;
  author: string;
  coverImageId: UUID | null;
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

export interface BookNote {
  id: UUID;
  bookId: UUID;
  extractedText: string;
  personalReflection: string;
  pageNumber: number | null;
  tags: string[];
  sourceImageId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export type BookInput = Pick<Book, "title" | "author" | "status">;

export type PreparedImage = Omit<StoredImage, "id" | "createdAt">;
