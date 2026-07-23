import { describe, expect, it } from "vitest";
import type { Book, BookNote } from "@/domain/models";
import {
  bookToRemote,
  isRemoteDeletionNewer,
  noteToRemote,
  remoteBookToLocal,
  remoteNoteToLocal,
  remoteWinsConflict,
} from "@/sync/mapping";
import type { RemoteBookRow, RemoteNoteRow } from "@/sync/types";

const userId = "90000000-0000-4000-8000-000000000000";
const bookId = "10000000-0000-4000-8000-000000000000";
const noteId = "20000000-0000-4000-8000-000000000000";
const imageId = "30000000-0000-4000-8000-000000000000";

const book: Book = {
  id: bookId,
  title: "Sapiens",
  author: "Yuval Noah Harari",
  coverImageId: imageId,
  status: "reading",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
};

const note: BookNote = {
  id: noteId,
  bookId,
  extractedText: "Un passage.",
  personalReflection: "Une réflexion.",
  pageNumber: null,
  tags: ["Histoire", "Idée"],
  sourceType: "scan",
  sourceImageId: null,
  createdAt: "2026-01-03T10:00:00.000Z",
  updatedAt: "2026-01-04T10:00:00.000Z",
};

describe("remote mapping", () => {
  it("convertit un livre local vers le schéma distant", () => {
    expect(
      bookToRemote(book, userId, `${userId}/${bookId}/${imageId}.jpg`),
    ).toEqual({
      user_id: userId,
      id: bookId,
      title: "Sapiens",
      author: "Yuval Noah Harari",
      status: "reading",
      cover_storage_path: `${userId}/${bookId}/${imageId}.jpg`,
      created_at: book.createdAt,
      updated_at: book.updatedAt,
      deleted_at: null,
    });
  });

  it("convertit et normalise un livre distant", () => {
    const row: RemoteBookRow = {
      ...bookToRemote(book, userId, null),
      server_updated_at: "2026-01-05T10:00:00.000Z",
    };
    expect(remoteBookToLocal(row, userId, imageId)).toEqual(book);
  });

  it("convertit une note locale et restaure dates, tags et champs facultatifs", () => {
    const remote = noteToRemote(note, userId);
    expect(remote).toMatchObject({
      user_id: userId,
      book_id: bookId,
      page_number: null,
      tags: ["Histoire", "Idée"],
      source_type: "scan",
    });

    const row: RemoteNoteRow = {
      ...remote,
      server_updated_at: "2026-01-05T10:00:00.000Z",
    };
    expect(remoteNoteToLocal(row, userId, new Set([bookId]))).toEqual(note);
  });

  it("refuse une note rattachée à un livre absent", () => {
    const row: RemoteNoteRow = {
      ...noteToRemote(note, userId),
      server_updated_at: "2026-01-05T10:00:00.000Z",
    };
    expect(() => remoteNoteToLocal(row, userId, new Set())).toThrow(
      "référence un livre absent",
    );
  });
});

describe("simple conflict resolution", () => {
  it("choisit le distant lorsqu’il est plus récent et qu’aucune mutation locale n’attend", () => {
    expect(
      remoteWinsConflict(
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        false,
      ),
    ).toBe(true);
  });

  it("conserve le local plus récent ou encore en attente", () => {
    expect(
      remoteWinsConflict(
        "2026-01-03T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        false,
      ),
    ).toBe(false);
    expect(
      remoteWinsConflict(
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        true,
      ),
    ).toBe(false);
  });

  it("fait gagner une suppression distante plus récente", () => {
    expect(
      isRemoteDeletionNewer(
        "2026-01-04T00:00:00.000Z",
        "2026-01-03T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      isRemoteDeletionNewer(
        "2026-01-02T00:00:00.000Z",
        "2026-01-03T00:00:00.000Z",
      ),
    ).toBe(false);
  });
});
