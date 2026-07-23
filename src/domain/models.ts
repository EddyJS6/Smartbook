export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export type ImageReference =
  | {
      kind: "local";
      uri: string;
      mimeType?: string;
    }
  | {
      kind: "remote";
      uri: string;
      storageKey?: string;
      mimeType?: string;
    };

export type BookStatus = "to_read" | "reading" | "read" | "archived";

export interface Book {
  id: UUID;
  title: string;
  author: string;
  coverImage: ImageReference | null;
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BookNote {
  id: UUID;
  bookId: UUID;
  extractedText: string;
  personalReflection: string;
  pageNumber: number | null;
  tags: string[];
  sourceImage: ImageReference | null;
  createdAt: string;
  updatedAt: string;
}
