"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { EmptyLibraryState } from "@/components/books/empty-library-state";
import { filterBooks } from "@/domain/book-search";
import { useBooks } from "@/hooks/use-books";
import { useNoteCounts } from "@/hooks/use-note-counts";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

function LibraryLoading() {
  return (
    <div className="grid gap-3" aria-label="Chargement de la bibliothèque">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="min-h-36 animate-pulse rounded-[1.4rem] border border-[var(--line)] bg-[var(--card)] p-3"
        >
          <div className="h-full w-[5.2rem] rounded-xl bg-[var(--paper-deep)]" />
        </div>
      ))}
    </div>
  );
}

export function LibraryClient() {
  const { status, books, error, reload } = useBooks();
  const noteCounts = useNoteCounts();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const filteredBooks = useMemo(
    () => filterBooks(books, query),
    [books, query],
  );
  const bookCount = books.length;

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    let noticeTimer: number | undefined;

    if (parameters.get("deleted") === "1") {
      noticeTimer = window.setTimeout(() => {
        setNotice("Le livre et sa couverture ont été supprimés.");
      }, 0);
      window.history.replaceState(null, "", window.location.pathname);
    }

    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
    };
  }, []);

  return (
    <div className="page-content">
      <header className="mb-8 pt-2">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[0.7rem] font-bold tracking-[0.18em] text-[var(--moss)] uppercase">
              BrainBook
            </p>
            <h1 className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Ma bibliothèque
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {status === "loading"
                ? "Ouverture de votre bibliothèque…"
                : `${bookCount} ${bookCount > 1 ? "livres" : "livre"} dans votre collection`}
            </p>
          </div>

          <div
            className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]"
            aria-hidden="true"
          >
            <Icon name="bookmark" size={20} />
          </div>
        </div>

        <Link
          href="/books/new"
          className="flex min-h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--moss)] px-5 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)] active:bg-[var(--moss-dark)]"
        >
          <Icon name="plus" size={20} />
          Ajouter un livre
        </Link>
      </header>

      {notice ? (
        <div className="mb-5">
          <StatusMessage tone="success">{notice}</StatusMessage>
        </div>
      ) : null}

      <section aria-label="Recherche" className="mb-8">
        <label className="relative block">
          <span className="sr-only">Rechercher dans la bibliothèque</span>
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--muted)]">
            <Icon name="search" size={20} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un titre ou un auteur"
            className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] py-3 pr-4 pl-12 text-base text-[var(--ink)] shadow-[0_2px_12px_rgb(48_39_30_/_0.035)] placeholder:text-[#969187]"
          />
        </label>
      </section>

      <section aria-labelledby="reading-list-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-[var(--clay)] uppercase">
              En ce moment
            </p>
            <h2
              id="reading-list-title"
              className="text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]"
            >
              Vos livres
            </h2>
          </div>
          {status === "ready" && bookCount > 0 ? (
            <span className="pb-0.5 text-xs text-[var(--muted)]">
              {bookCount} au total
            </span>
          ) : null}
        </div>

        {status === "loading" ? <LibraryLoading /> : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-[#e7c8be] bg-[var(--card)] p-6 text-center">
            <StatusMessage tone="error">{error}</StatusMessage>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-5 min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--moss)]"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {status === "ready" && bookCount === 0 ? <EmptyLibraryState /> : null}

        {status === "ready" && bookCount > 0 && filteredBooks.length > 0 ? (
          <div className="grid gap-3">
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                noteCount={noteCounts[book.id] ?? 0}
              />
            ))}
          </div>
        ) : null}

        {status === "ready" &&
        bookCount > 0 &&
        filteredBooks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-9 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
              <Icon name="search" size={22} />
            </span>
            <h3 className="mt-4 font-semibold">Aucun livre trouvé</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Essayez un autre titre ou un autre auteur.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
