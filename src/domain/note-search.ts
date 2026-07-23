import type { NoteWithBook } from "@/domain/models";
import { normalizeSearchQuery } from "@/domain/book-search";

export function filterIdeas(
  entries: readonly NoteWithBook[],
  query: string,
  selectedTag: string | null,
): NoteWithBook[] {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedTag = selectedTag
    ? normalizeSearchQuery(selectedTag)
    : null;

  return entries.filter(({ note, book }) => {
    const matchesTag =
      !normalizedTag ||
      note.tags.some((tag) => normalizeSearchQuery(tag) === normalizedTag);

    if (!matchesTag) return false;
    if (!normalizedQuery) return true;

    const searchableValues = [
      note.extractedText,
      note.personalReflection,
      note.pageNumber ?? "",
      note.tags.join(" "),
      book.title,
      book.author,
    ];

    return searchableValues.some((value) =>
      normalizeSearchQuery(value).includes(normalizedQuery),
    );
  });
}

export function collectIdeaTags(
  entries: readonly NoteWithBook[],
): string[] {
  const tags = new Map<string, string>();

  for (const { note } of entries) {
    for (const tag of note.tags) {
      const key = normalizeSearchQuery(tag);
      if (!tags.has(key)) tags.set(key, tag);
    }
  }

  return [...tags.values()].sort((left, right) =>
    left.localeCompare(right, "fr", { sensitivity: "base" }),
  );
}
