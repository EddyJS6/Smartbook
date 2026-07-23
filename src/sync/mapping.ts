import type {
  Book,
  BookNote,
  BookStatus,
  NoteSourceType,
  UUID,
} from "@/domain/models";
import { normalizeBookText } from "@/domain/book-validation";
import {
  normalizeMultilineText,
  normalizePageReference,
  normalizeTags,
} from "@/domain/note-validation";
import type {
  RemoteBookRow,
  RemoteNoteRow,
} from "@/sync/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOK_STATUSES = new Set<BookStatus>([
  "to_read",
  "reading",
  "finished",
]);
const NOTE_SOURCE_TYPES = new Set<NoteSourceType>([
  "manual",
  "scan",
  "import",
]);

export class RemoteDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteDataValidationError";
  }
}

export function isUuid(value: unknown): value is UUID {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new RemoteDataValidationError(`Date distante invalide : ${field}.`);
  }
  return new Date(value).toISOString();
}

function requireOwnedUuid(
  value: unknown,
  field: string,
): UUID {
  if (!isUuid(value)) {
    throw new RemoteDataValidationError(`UUID distant invalide : ${field}.`);
  }
  return value;
}

export function bookToRemote(
  book: Book,
  userId: UUID,
  coverStoragePath: string | null,
) {
  return {
    user_id: userId,
    id: book.id,
    title: book.title,
    author: book.author,
    status: book.status,
    cover_storage_path: coverStoragePath,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
    deleted_at: null,
  };
}

export function remoteBookToLocal(
  row: RemoteBookRow,
  expectedUserId: UUID,
  coverImageId: UUID | null,
): Book {
  const id = requireOwnedUuid(row.id, "books.id");
  if (row.user_id !== expectedUserId) {
    throw new RemoteDataValidationError(
      "Un livre distant n’appartient pas au compte connecté.",
    );
  }
  if (!BOOK_STATUSES.has(row.status as BookStatus)) {
    throw new RemoteDataValidationError("Statut de livre distant invalide.");
  }
  const title = normalizeBookText(row.title);
  const author = normalizeBookText(row.author);
  if (!title || !author) {
    throw new RemoteDataValidationError(
      "Un livre distant possède un titre ou un auteur vide.",
    );
  }

  return {
    id,
    title,
    author,
    status: row.status as BookStatus,
    coverImageId,
    createdAt: requireDate(row.created_at, "books.created_at"),
    updatedAt: requireDate(row.updated_at, "books.updated_at"),
  };
}

export function noteToRemote(note: BookNote, userId: UUID) {
  return {
    user_id: userId,
    id: note.id,
    book_id: note.bookId,
    extracted_text: note.extractedText,
    personal_reflection: note.personalReflection,
    page_number: note.pageNumber,
    tags: note.tags,
    source_type: note.sourceType,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: null,
  };
}

export function remoteNoteToLocal(
  row: RemoteNoteRow,
  expectedUserId: UUID,
  knownBookIds: ReadonlySet<UUID>,
): BookNote {
  const id = requireOwnedUuid(row.id, "book_notes.id");
  const bookId = requireOwnedUuid(row.book_id, "book_notes.book_id");
  if (row.user_id !== expectedUserId) {
    throw new RemoteDataValidationError(
      "Une note distante n’appartient pas au compte connecté.",
    );
  }
  if (!knownBookIds.has(bookId)) {
    throw new RemoteDataValidationError(
      "Une note distante référence un livre absent.",
    );
  }
  if (!NOTE_SOURCE_TYPES.has(row.source_type as NoteSourceType)) {
    throw new RemoteDataValidationError("Provenance de note distante invalide.");
  }
  if (!Array.isArray(row.tags) || row.tags.some((tag) => typeof tag !== "string")) {
    throw new RemoteDataValidationError("Tags distants invalides.");
  }

  const extractedText = normalizeMultilineText(row.extracted_text);
  const personalReflection = normalizeMultilineText(row.personal_reflection);
  if (!extractedText && !personalReflection) {
    throw new RemoteDataValidationError("Une note distante est vide.");
  }

  return {
    id,
    bookId,
    extractedText,
    personalReflection,
    pageNumber: normalizePageReference(row.page_number ?? ""),
    tags: normalizeTags(row.tags),
    sourceType: row.source_type as NoteSourceType,
    sourceImageId: null,
    createdAt: requireDate(row.created_at, "book_notes.created_at"),
    updatedAt: requireDate(row.updated_at, "book_notes.updated_at"),
  };
}

export function isRemoteDeletionNewer(
  deletedAt: string | null,
  localUpdatedAt: string,
): boolean {
  return Boolean(
    deletedAt &&
      Number.isFinite(Date.parse(deletedAt)) &&
      Date.parse(deletedAt) >= Date.parse(localUpdatedAt),
  );
}

export function remoteWinsConflict(
  localUpdatedAt: string,
  remoteUpdatedAt: string,
  hasPendingLocalMutation: boolean,
): boolean {
  if (hasPendingLocalMutation) return false;
  return Date.parse(remoteUpdatedAt) > Date.parse(localUpdatedAt);
}
