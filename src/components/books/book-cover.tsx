"use client";

import Image from "next/image";
import type { Book } from "@/domain/models";
import { useCoverUrl } from "@/hooks/use-cover-url";

type BookCoverProps = {
  book: Pick<Book, "title" | "author" | "coverImageId">;
  className?: string;
  priority?: boolean;
};

const placeholderColors = [
  { background: "#315f4d", foreground: "#fffdf9" },
  { background: "#b96146", foreground: "#fffaf2" },
  { background: "#75566a", foreground: "#fffaf2" },
  { background: "#c9b37a", foreground: "#363228" },
];

function getPlaceholderStyle(title: string, author: string) {
  const seed = `${title}${author}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return placeholderColors[seed % placeholderColors.length];
}

function getInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("fr"))
    .join("");
}

export function BookCover({
  book,
  className = "",
  priority = false,
}: BookCoverProps) {
  const { url, loading } = useCoverUrl(book.coverImageId);
  const colors = getPlaceholderStyle(book.title, book.author);

  return (
    <div
      className={`relative isolate overflow-hidden bg-[var(--paper-deep)] ${className}`}
      style={
        url
          ? undefined
          : {
              backgroundColor: colors.background,
              color: colors.foreground,
            }
      }
    >
      {url ? (
        <Image
          src={url}
          alt={`Couverture de ${book.title}`}
          fill
          unoptimized
          priority={priority}
          sizes="(max-width: 640px) 60vw, 280px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full min-h-20 flex-col items-center justify-center px-3 text-center">
          <span className="font-serif text-2xl font-semibold tracking-[-0.04em]">
            {loading ? "…" : getInitials(book.title) || "BB"}
          </span>
          {!loading ? (
            <>
              <span className="mt-2 line-clamp-2 text-[0.58rem] leading-tight font-bold tracking-[0.08em] uppercase">
                {book.title || "Votre livre"}
              </span>
              <span className="mt-1 line-clamp-1 text-[0.48rem] opacity-75">
                {book.author || "Auteur"}
              </span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
