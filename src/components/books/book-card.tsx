import Link from "next/link";
import type { Book } from "@/domain/models";
import { bookStatusLabels } from "@/domain/book-status";
import { BookCover } from "@/components/books/book-cover";
import { Icon } from "@/components/ui/icon";

type BookCardProps = {
  book: Book;
};

export function BookCard({ book }: BookCardProps) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="book-card flex min-h-36 gap-4 rounded-[1.4rem] border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_4px_18px_rgb(48_39_30_/_0.045)]"
      aria-label={`Ouvrir ${book.title}`}
    >
      <BookCover
        book={book}
        className="aspect-[2/3] w-[5.2rem] shrink-0 rounded-xl shadow-[0_5px_14px_rgb(48_39_30_/_0.12)]"
      />

      <article className="flex min-w-0 flex-1 flex-col py-1.5">
        <span className="mb-2 w-fit rounded-full bg-[var(--moss-soft)] px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.04em] text-[var(--moss)] uppercase">
          {bookStatusLabels[book.status]}
        </span>
        <h3 className="line-clamp-2 text-[1.05rem] leading-snug font-semibold tracking-[-0.02em] text-[var(--ink)]">
          {book.title}
        </h3>
        <p className="mt-1 truncate text-sm text-[var(--muted)]">{book.author}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <Icon name="note" size={15} />0 note
          </span>
          <span
            className="flex size-8 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--moss)]"
            aria-hidden="true"
          >
            <Icon name="chevron" size={17} />
          </span>
        </div>
      </article>
    </Link>
  );
}
