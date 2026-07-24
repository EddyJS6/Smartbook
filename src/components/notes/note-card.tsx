"use client";

import Link from "next/link";
import type { Book, BookNote } from "@/domain/models";
import { ContentArtwork } from "@/components/books/content-artwork";
import { TagPill } from "@/components/notes/tag-pill";
import { Icon } from "@/components/ui/icon";
import { formatShortDate } from "@/lib/format-date";
import { useNoteReadingMetadata } from "@/hooks/use-note-reading-metadata";

type NoteCardProps = {
  note: BookNote;
  book?: Book;
};

export function NoteCard({ note, book }: NoteCardProps) {
  const visibleTags = note.tags.slice(0, 3);
  const { metadata } = useNoteReadingMetadata(note.id);

  return (
    <Link
      href={`/books/${note.bookId}/notes/${note.id}`}
      className="block rounded-[1.4rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_4px_18px_rgb(48_39_30_/_0.04)]"
      aria-label={`Ouvrir la note${book ? ` de ${book.title}` : ""}`}
    >
      {book ? (
        <div className="mb-4 flex items-center gap-3 border-b border-[var(--line)] pb-3">
          <ContentArtwork
            content={book}
            className={`w-12 shrink-0 rounded-lg shadow-sm ${
              book.contentType === "video" ? "aspect-video" : "aspect-[2/3]"
            }`}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {book.title}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{book.author}</p>
          </div>
        </div>
      ) : null}

      {note.title ? (
        <h3 className="mb-2 line-clamp-2 font-semibold text-[var(--ink)]">
          {note.title}
        </h3>
      ) : null}

      {metadata?.isFavorite || metadata?.isImportant ? (
        <div className="mb-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold">
          {metadata.isFavorite ? (
            <span className="inline-flex items-center gap-1 text-[#8a6a2e]">
              <Icon name="star" size={14} />
              Favorite
            </span>
          ) : null}
          {metadata.isImportant ? (
            <span className="inline-flex items-center gap-1 text-[var(--clay)]">
              <Icon name="flag" size={14} />
              Importante
            </span>
          ) : null}
        </div>
      ) : null}

      {note.extractedText ? (
        <p className="line-clamp-3 whitespace-pre-line font-serif text-[0.98rem] leading-6 text-[var(--ink)]">
          {note.extractedText}
        </p>
      ) : null}

      {note.personalReflection ? (
        <div
          className={`line-clamp-2 text-sm leading-5 text-[var(--muted)] ${
            note.extractedText ? "mt-3 border-l-2 border-[#d8c9b6] pl-3" : ""
          }`}
        >
          {note.personalReflection}
        </div>
      ) : null}

      {visibleTags.length > 0 ? (
        <div className="mt-4 flex min-w-0 flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
            <TagPill key={tag.toLocaleLowerCase("fr")} tag={tag} />
          ))}
          {note.tags.length > visibleTags.length ? (
            <span className="rounded-full bg-[var(--paper)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--muted)]">
              +{note.tags.length - visibleTags.length}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
        <span className="min-w-0 truncate">
          {note.pageNumber ? `Réf. ${note.pageNumber} · ` : ""}
          {formatShortDate(note.updatedAt)}
        </span>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--moss)]"
          aria-hidden="true"
        >
          <Icon name="chevron" size={16} />
        </span>
      </div>
    </Link>
  );
}
