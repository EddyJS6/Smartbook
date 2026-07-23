import type { Book } from "@/domain/models";
import { normalizeBookText } from "@/domain/book-validation";

export function normalizeSearchQuery(value: string): string {
  return normalizeBookText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
}

export function filterBooks(books: readonly Book[], query: string): Book[] {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [...books];
  }

  return books.filter((book) => {
    const title = normalizeSearchQuery(book.title);
    const author = normalizeSearchQuery(book.author);
    return title.includes(normalizedQuery) || author.includes(normalizedQuery);
  });
}
