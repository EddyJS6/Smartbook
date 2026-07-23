"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import {
  filterIdeas,
  sortIdeas,
  type IdeaFilter,
  type IdeaSort,
} from "@/domain/note-search";
import { useIdeas } from "@/hooks/use-ideas";
import { reportStorageError } from "@/storage/errors";
import { noteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";
import {
  readingPreferencesRepository,
  type ReadingSize,
} from "@/storage/repositories/reading-preferences-repository";

const validFilters = new Set<IdeaFilter>([
  "all",
  "favorites",
  "important",
  "recent",
  "rarelyRead",
  "neverRead",
]);
const validSorts = new Set<IdeaSort>([
  "updated",
  "created",
  "bookTitle",
  "rarelyRead",
  "random",
]);

export function ReadingClient() {
  const parameters = useSearchParams();
  const { status, entries, error } = useIdeas();
  const bookId = parameters.get("bookId");
  const query = parameters.get("query") ?? "";
  const tag = parameters.get("tag");
  const initialNoteId = parameters.get("noteId");
  const filterValue = parameters.get("filter") as IdeaFilter | null;
  const sortValue = parameters.get("sort") as IdeaSort | null;
  const filter =
    filterValue && validFilters.has(filterValue) ? filterValue : "all";
  const sort = sortValue && validSorts.has(sortValue) ? sortValue : "updated";
  const randomSeed = parameters.get("seed") ?? "reading";
  const [currentNoteId, setCurrentNoteId] = useState(initialNoteId);
  const [readingSize, setReadingSize] = useState<ReadingSize>(() =>
    readingPreferencesRepository.getCached(),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const readThisSession = useRef(new Set<string>());

  const readingEntries = useMemo(() => {
    const scoped = bookId
      ? entries.filter(({ note }) => note.bookId === bookId)
      : entries;
    return sortIdeas(filterIdeas(scoped, query, tag, filter), sort, randomSeed);
  }, [bookId, entries, filter, query, randomSeed, sort, tag]);

  const selectedIndex = currentNoteId
    ? readingEntries.findIndex(({ note }) => note.id === currentNoteId)
    : -1;
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const current = readingEntries[currentIndex] ?? null;

  useEffect(() => {
    let active = true;
    const reconcile = () => {
      void readingPreferencesRepository
        .reconcile()
        .then((size) => {
          if (active) setReadingSize(size);
        })
        .catch(() => undefined);
    };
    reconcile();
    window.addEventListener("online", reconcile);
    return () => {
      active = false;
      window.removeEventListener("online", reconcile);
    };
  }, []);

  useEffect(() => {
    if (!current || readThisSession.current.has(current.note.id)) return;
    const noteId = current.note.id;
    const timer = window.setTimeout(() => {
      if (readThisSession.current.has(noteId)) return;
      readThisSession.current.add(noteId);
      void noteReadingMetadataRepository
        .recordRead(noteId)
        .catch((failure: unknown) =>
          setActionError(reportStorageError(failure).message),
        );
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [current]);

  const toggleFlag = async (kind: "favorite" | "important") => {
    if (!current) return;
    setActionError(null);
    try {
      if (kind === "favorite") {
        await noteReadingMetadataRepository.setFavorite(
          current.note.id,
          !current.readingMetadata?.isFavorite,
        );
      } else {
        await noteReadingMetadataRepository.setImportant(
          current.note.id,
          !current.readingMetadata?.isImportant,
        );
      }
    } catch (failure) {
      setActionError(reportStorageError(failure).message);
    }
  };

  const exitHref = bookId ? `/books/${bookId}` : "/ideas";
  const textSize =
    readingSize === "compact"
      ? "text-base leading-7"
      : readingSize === "large"
        ? "text-xl leading-9"
        : "text-lg leading-8";

  if (status === "loading") {
    return (
      <div className="page-content">
        <div className="h-96 animate-pulse rounded-3xl bg-[var(--card)]" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="page-content">
        <StatusMessage tone="error">{error}</StatusMessage>
        <Link href={exitHref} className="mt-5 inline-flex text-sm font-semibold text-[var(--moss)]">
          Quitter le mode lecture
        </Link>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="page-content flex items-center">
        <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center">
          <Icon name="reader" size={30} />
          <h1 className="mt-5 text-xl font-semibold">Aucune note à relire</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Aucun contenu ne correspond aux filtres sélectionnés.
          </p>
          <Link href={exitHref} className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white">
            Revenir en arrière
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[32rem] px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <Link
          href={exitHref}
          aria-label="Quitter le mode lecture"
          className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--moss)]"
        >
          <Icon name="close" size={19} />
        </Link>
        <p className="text-xs font-semibold text-[var(--muted)]">
          {currentIndex + 1} / {readingEntries.length}
        </p>
        <div className="flex rounded-full border border-[var(--line)] bg-[var(--card)] p-1">
          {(["compact", "comfortable", "large"] as const).map((size, index) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                setReadingSize(size);
                void readingPreferencesRepository
                  .set(size)
                  .catch((failure: unknown) =>
                    setActionError(reportStorageError(failure).message),
                  );
              }}
              aria-label={
                index === 0
                  ? "Texte compact"
                  : index === 1
                    ? "Texte confortable"
                    : "Grand texte"
              }
              aria-pressed={readingSize === size}
              className={`flex size-8 items-center justify-center rounded-full font-serif font-semibold ${
                readingSize === size
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--muted)]"
              }`}
            >
              <span className={index === 0 ? "text-xs" : index === 1 ? "text-sm" : "text-base"}>
                A
              </span>
            </button>
          ))}
        </div>
      </header>

      {actionError ? (
        <div className="mt-4">
          <StatusMessage tone="error">{actionError}</StatusMessage>
        </div>
      ) : null}

      <article className="mt-7">
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {current.book.title}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {current.book.author}
            {current.note.pageNumber ? ` · ${current.note.pageNumber}` : ""}
          </p>
        </div>

        {current.note.extractedText ? (
          <section className="mt-8 rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-6">
            <p className="text-[0.67rem] font-bold tracking-[0.13em] text-[var(--clay)] uppercase">
              Passage du livre
            </p>
            <div className={`mt-5 whitespace-pre-wrap break-words font-serif text-[var(--ink)] ${textSize}`}>
              {current.note.extractedText}
            </div>
          </section>
        ) : null}

        {current.note.personalReflection ? (
          <section className="mt-4 rounded-[2rem] bg-[#ece5da] p-6">
            <p className="text-[0.67rem] font-bold tracking-[0.13em] text-[var(--moss)] uppercase">
              Ma réflexion
            </p>
            <div className={`mt-5 whitespace-pre-wrap break-words text-[var(--ink)] ${textSize}`}>
              {current.note.personalReflection}
            </div>
          </section>
        ) : null}
      </article>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={current.readingMetadata?.isFavorite ?? false}
          onClick={() => void toggleFlag("favorite")}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold ${
            current.readingMetadata?.isFavorite
              ? "border-[#b89b62] bg-[#f4ead5] text-[#765921]"
              : "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
          }`}
        >
          <Icon name="star" size={17} />
          Favorite
        </button>
        <button
          type="button"
          aria-pressed={current.readingMetadata?.isImportant ?? false}
          onClick={() => void toggleFlag("important")}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold ${
            current.readingMetadata?.isImportant
              ? "border-[#ca866f] bg-[#f6e5df] text-[var(--clay)]"
              : "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
          }`}
        >
          <Icon name="flag" size={17} />
          Importante
        </button>
      </div>

      <nav aria-label="Navigation entre les notes" className="mt-7 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() =>
            setCurrentNoteId(readingEntries[currentIndex - 1]?.note.id ?? null)
          }
          className="min-h-13 rounded-2xl border border-[var(--line)] bg-[var(--card)] text-sm font-semibold text-[var(--moss)] disabled:opacity-35"
        >
          ← Précédente
        </button>
        <button
          type="button"
          disabled={currentIndex >= readingEntries.length - 1}
          onClick={() =>
            setCurrentNoteId(readingEntries[currentIndex + 1]?.note.id ?? null)
          }
          className="min-h-13 rounded-2xl bg-[var(--moss)] text-sm font-semibold text-white disabled:opacity-35"
        >
          Suivante →
        </button>
      </nav>
    </div>
  );
}
