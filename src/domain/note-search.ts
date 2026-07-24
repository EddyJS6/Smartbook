import type { NoteWithBook } from "@/domain/models";
import { normalizeSearchQuery } from "@/domain/book-search";

export type IdeaFilter =
  | "all"
  | "favorites"
  | "important"
  | "recent"
  | "rarelyRead"
  | "neverRead";

export type IdeaSort =
  | "updated"
  | "created"
  | "bookTitle"
  | "rarelyRead"
  | "random";

export function filterIdeas(
  entries: readonly NoteWithBook[],
  query: string,
  selectedTag: string | null,
  filter: IdeaFilter = "all",
  now = Date.now(),
): NoteWithBook[] {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedTag = selectedTag
    ? normalizeSearchQuery(selectedTag)
    : null;

  return entries.filter(({ note, book, readingMetadata: metadata }) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "favorites" && metadata?.isFavorite) ||
      (filter === "important" && metadata?.isImportant) ||
      (filter === "recent" &&
        now - Date.parse(note.createdAt) <= 30 * 24 * 60 * 60 * 1_000) ||
      (filter === "rarelyRead" && (metadata?.readCount ?? 0) <= 1) ||
      (filter === "neverRead" && !metadata?.lastReadAt);
    if (!matchesFilter) return false;
    const matchesTag =
      !normalizedTag ||
      note.tags.some((tag) => normalizeSearchQuery(tag) === normalizedTag);

    if (!matchesTag) return false;
    if (!normalizedQuery) return true;

    const searchableValues = [
      note.title ?? "",
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

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sortIdeas(
  entries: readonly NoteWithBook[],
  sort: IdeaSort,
  randomSeed = "brainbook",
): NoteWithBook[] {
  return [...entries].sort((left, right) => {
    if (sort === "created") {
      return Date.parse(right.note.createdAt) - Date.parse(left.note.createdAt);
    }
    if (sort === "bookTitle") {
      return left.book.title.localeCompare(right.book.title, "fr", {
        sensitivity: "base",
      });
    }
    if (sort === "rarelyRead") {
      const countDifference =
        (left.readingMetadata?.readCount ?? 0) -
        (right.readingMetadata?.readCount ?? 0);
      if (countDifference !== 0) return countDifference;
      return (
        Date.parse(left.readingMetadata?.lastReadAt ?? "1970-01-01") -
        Date.parse(right.readingMetadata?.lastReadAt ?? "1970-01-01")
      );
    }
    if (sort === "random") {
      return (
        stableHash(`${randomSeed}:${left.note.id}`) -
        stableHash(`${randomSeed}:${right.note.id}`)
      );
    }
    return Date.parse(right.note.updatedAt) - Date.parse(left.note.updatedAt);
  });
}

export function chooseRediscovery(
  entries: readonly NoteWithBook[],
  seed: string,
  excludedNoteId?: string,
): NoteWithBook | null {
  const candidates = entries
    .filter((entry) => entry.note.id !== excludedNoteId)
    .sort((left, right) => {
      const leftSuggested =
        left.readingMetadata?.lastSuggestedAt ?? "1970-01-01";
      const rightSuggested =
        right.readingMetadata?.lastSuggestedAt ?? "1970-01-01";
      return Date.parse(leftSuggested) - Date.parse(rightSuggested);
    });
  if (candidates.length === 0) return null;
  const leastRecentPool = candidates.slice(
    0,
    Math.max(1, Math.ceil(candidates.length / 3)),
  );
  return leastRecentPool[stableHash(seed) % leastRecentPool.length] ?? null;
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
