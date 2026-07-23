import { describe, expect, it } from "vitest";
import type { Book, BookNote, NoteWithBook } from "@/domain/models";
import { collectIdeaTags, filterIdeas } from "@/domain/note-search";

const book: Book = {
  id: "10000000-0000-4000-8000-000000000000",
  title: "Sapiens",
  author: "Yuval Noah Harari",
  coverImageId: null,
  status: "reading",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function entry(
  id: string,
  values: Partial<BookNote>,
  entryBook: Book = book,
): NoteWithBook {
  return {
    book: entryBook,
    note: {
      id: id as BookNote["id"],
      bookId: entryBook.id,
      extractedText: "",
      personalReflection: "",
      pageNumber: null,
      tags: [],
      sourceType: "manual",
      sourceImageId: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      ...values,
    },
  };
}

describe("idea search", () => {
  const entries = [
    entry("20000000-0000-4000-8000-000000000000", {
      extractedText: "Les mythes organisent les sociétés.",
      personalReflection: "Comparer avec nos habitudes.",
      pageNumber: "Chapitre 2",
      tags: ["Anthropologie", "Habitudes"],
    }),
    entry(
      "30000000-0000-4000-8000-000000000000",
      {
        personalReflection: "Relire ce passage plus tard.",
        tags: ["Histoire"],
      },
      {
        ...book,
        id: "40000000-0000-4000-8000-000000000000",
        title: "Méditations",
        author: "Marc Aurèle",
      },
    ),
  ];

  it.each([
    ["mythes", 1],
    ["HABITUDES", 1],
    ["chapitre 2", 1],
    ["sapiens", 1],
    ["harari", 1],
    ["marc aurele", 1],
  ])("recherche « %s » dans tous les champs utiles", (query, count) => {
    expect(filterIdeas(entries, query, null)).toHaveLength(count);
  });

  it("combine la recherche textuelle et le filtre par tag", () => {
    expect(filterIdeas(entries, "mythes", "anthropologie")).toHaveLength(1);
    expect(filterIdeas(entries, "mythes", "histoire")).toHaveLength(0);
  });

  it("rassemble les tags sans doublons de casse", () => {
    const withDuplicate = [
      ...entries,
      entry("50000000-0000-4000-8000-000000000000", {
        tags: ["anthropologie"],
      }),
    ];

    expect(collectIdeaTags(withDuplicate)).toEqual([
      "Anthropologie",
      "Habitudes",
      "Histoire",
    ]);
  });
});
