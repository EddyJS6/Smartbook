import { describe, expect, it } from "vitest";
import { filterBooks } from "@/domain/book-search";
import type { Book } from "@/domain/models";

const books: Book[] = [
  {
    id: "f541d4d3-7844-42c0-8a97-6a8f8d3a0d11",
    title: "Une chambre à soi",
    author: "Virginia Woolf",
    status: "to_read",
    coverImageId: null,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "68e53a30-bddb-4936-b4f4-b082de4df52e",
    title: "Siddhartha",
    author: "Hermann Hesse",
    status: "finished",
    coverImageId: null,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
  },
];

describe("filterBooks", () => {
  it("recherche par titre sans tenir compte de la casse et des espaces", () => {
    expect(filterBooks(books, "  SIDDHARTHA  ")).toEqual([books[1]]);
  });

  it("recherche par auteur", () => {
    expect(filterBooks(books, "virginia")).toEqual([books[0]]);
  });

  it("retourne toute la bibliothèque pour une recherche vide", () => {
    expect(filterBooks(books, "   ")).toEqual(books);
  });
});
