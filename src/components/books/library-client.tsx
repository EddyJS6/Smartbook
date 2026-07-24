"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { EmptyLibraryState } from "@/components/books/empty-library-state";
import { VideoCard } from "@/components/books/video-card";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { filterBooks } from "@/domain/book-search";
import { useBooks } from "@/hooks/use-books";
import { useNoteCounts } from "@/hooks/use-note-counts";

function LibraryLoading() {
  return (
    <div className="grid gap-3" aria-label="Chargement de la bibliothèque">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-[1.4rem] border border-[var(--line)] bg-[var(--card)]"
        />
      ))}
    </div>
  );
}

export function LibraryClient() {
  const { status, books, error, reload } = useBooks();
  const noteCounts = useNoteCounts();
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<
    "all" | "books" | "videos"
  >("all");
  const [notice, setNotice] = useState<string | null>(null);

  const filteredContents = useMemo(() => {
    const searched = filterBooks(books, query);
    if (contentFilter === "books") {
      return searched.filter((book) => book.contentType !== "video");
    }
    if (contentFilter === "videos") {
      return searched.filter((book) => book.contentType === "video");
    }
    return searched;
  }, [books, contentFilter, query]);
  const bookCount = books.filter((book) => book.contentType !== "video").length;
  const videoCount = books.filter((book) => book.contentType === "video").length;
  const contentCount = books.length;

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    let noticeTimer: number | undefined;
    let filterTimer: number | undefined;
    if (parameters.get("type") === "videos") {
      filterTimer = window.setTimeout(() => setContentFilter("videos"), 0);
    } else if (parameters.get("type") === "books") {
      filterTimer = window.setTimeout(() => setContentFilter("books"), 0);
    }
    if (parameters.has("deleted")) {
      const message =
        parameters.get("deleted") === "video"
          ? "La vidéo et toutes ses notes ont été supprimées."
          : "Le livre, sa couverture et ses notes ont été supprimés.";
      noticeTimer = window.setTimeout(() => setNotice(message), 0);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
      if (filterTimer) window.clearTimeout(filterTimer);
    };
  }, []);

  return (
    <div className="page-content">
      <header className="mb-7 pt-2">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[0.7rem] font-bold tracking-[0.18em] text-[var(--moss)] uppercase">
              BrainBook
            </p>
            <h1 className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.04em]">
              Ma bibliothèque
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {status === "loading"
                ? "Ouverture de votre bibliothèque…"
                : `${contentCount} ${contentCount > 1 ? "contenus" : "contenu"} dans votre collection`}
            </p>
          </div>
          <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
            <Icon name="bookmark" size={20} />
          </span>
        </div>

        <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
          Ajouter
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/books/new"
            className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-3 text-sm font-semibold text-white"
          >
            <Icon name="book" size={19} />
            Un livre
          </Link>
          <Link
            href="/videos/new"
            className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-[var(--moss)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--moss)]"
          >
            <Icon name="video" size={19} />
            Une vidéo
          </Link>
        </div>
      </header>

      {notice ? (
        <div className="mb-5">
          <StatusMessage tone="success">{notice}</StatusMessage>
        </div>
      ) : null}

      <section aria-label="Type de contenu" className="mb-4">
        <div className="grid grid-cols-3 rounded-2xl bg-[var(--paper-deep)] p-1">
          {[
            { value: "all" as const, label: `Tout · ${contentCount}` },
            { value: "books" as const, label: `Livres · ${bookCount}` },
            { value: "videos" as const, label: `Vidéos · ${videoCount}` },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={contentFilter === item.value}
              onClick={() => setContentFilter(item.value)}
              className={`min-h-11 rounded-xl px-2 text-xs font-semibold ${
                contentFilter === item.value
                  ? "bg-[var(--card)] text-[var(--moss)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

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
            placeholder="Rechercher un contenu ou un auteur"
            className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] py-3 pr-4 pl-12 text-base"
          />
        </label>
      </section>

      <section aria-labelledby="content-list-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-[var(--clay)] uppercase">
              En ce moment
            </p>
            <h2 id="content-list-title" className="text-xl font-semibold">
              Vos contenus
            </h2>
          </div>
          {status === "ready" && contentCount > 0 ? (
            <span className="pb-0.5 text-xs text-[var(--muted)]">
              {filteredContents.length} affiché
              {filteredContents.length > 1 ? "s" : ""}
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
              className="mt-5 min-h-11 px-4 text-sm font-semibold text-[var(--moss)]"
            >
              Réessayer
            </button>
          </div>
        ) : null}
        {status === "ready" && contentCount === 0 ? <EmptyLibraryState /> : null}

        {status === "ready" && filteredContents.length > 0 ? (
          <div className="grid gap-3">
            {filteredContents.map((content) =>
              content.contentType === "video" ? (
                <VideoCard
                  key={content.id}
                  video={content}
                  noteCount={noteCounts[content.id] ?? 0}
                />
              ) : (
                <BookCard
                  key={content.id}
                  book={content}
                  noteCount={noteCounts[content.id] ?? 0}
                />
              ),
            )}
          </div>
        ) : null}

        {status === "ready" &&
        contentCount > 0 &&
        filteredContents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-9 text-center">
            <Icon name="search" size={23} />
            <h3 className="mt-4 font-semibold">Aucun contenu trouvé</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Modifiez la recherche ou changez de catégorie.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
