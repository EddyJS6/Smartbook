import { describe, expect, it } from "vitest";
import type {
  Book,
  BookNote,
  NoteReadingMetadata,
  NoteWithBook,
} from "@/domain/models";
import {
  chooseRediscovery,
  collectIdeaTags,
  filterIdeas,
  sortIdeas,
} from "@/domain/note-search";

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
  readingMetadata?: Partial<NoteReadingMetadata>,
): NoteWithBook {
  const note = {
    id: id as BookNote["id"],
    bookId: entryBook.id,
    extractedText: "",
    personalReflection: "",
    pageNumber: null,
    tags: [],
    sourceType: "manual" as const,
    sourceImageId: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...values,
  };
  return {
    book: entryBook,
    note,
    readingMetadata: readingMetadata
      ? {
          noteId: note.id,
          isFavorite: false,
          isImportant: false,
          favoriteIndex: 0,
          importantIndex: 0,
          lastReadAt: null,
          readCount: 0,
          lastSuggestedAt: null,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          ...readingMetadata,
        }
      : undefined,
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

  it("filtre les favoris, les notes importantes et celles jamais relues", () => {
    const marked = [
      entry(
        "60000000-0000-4000-8000-000000000000",
        {},
        book,
        { isFavorite: true, favoriteIndex: 1 },
      ),
      entry(
        "70000000-0000-4000-8000-000000000000",
        {},
        book,
        {
          isImportant: true,
          importantIndex: 1,
          lastReadAt: "2026-01-04T00:00:00.000Z",
          readCount: 2,
        },
      ),
    ];
    expect(filterIdeas(marked, "", null, "favorites")).toHaveLength(1);
    expect(filterIdeas(marked, "", null, "important")).toHaveLength(1);
    expect(filterIdeas(marked, "", null, "neverRead")).toHaveLength(1);
  });

  it("garde un ordre aléatoire stable pour une même session", () => {
    expect(sortIdeas(entries, "random", "session")).toEqual(
      sortIdeas(entries, "random", "session"),
    );
  });

  it("évite la dernière suggestion lorsqu’une autre note existe", () => {
    const first = chooseRediscovery(entries, "jour");
    expect(
      chooseRediscovery(entries, "autre", first?.note.id)?.note.id,
    ).not.toBe(first?.note.id);
  });
});
