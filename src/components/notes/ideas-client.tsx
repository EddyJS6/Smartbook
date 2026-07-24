"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NoteCard } from "@/components/notes/note-card";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import {
  noteDocumentToPlainText,
  noteToDocument,
} from "@/domain/note-document";
import {
  chooseRediscovery,
  collectIdeaTags,
  filterIdeas,
  sortIdeas,
  type IdeaFilter,
  type IdeaSort,
} from "@/domain/note-search";
import { useIdeas } from "@/hooks/use-ideas";
import { noteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";

const filters: ReadonlyArray<{ value: IdeaFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "favorites", label: "Favorites" },
  { value: "important", label: "Importantes" },
  { value: "recent", label: "Récentes" },
  { value: "rarelyRead", label: "Peu relues" },
  { value: "neverRead", label: "Jamais relues" },
];

function buildReadingHref(
  query: string,
  tag: string | null,
  filter: IdeaFilter,
  sort: IdeaSort,
  randomSeed: string,
) {
  const parameters = new URLSearchParams({ context: "ideas", filter, sort });
  if (query.trim()) parameters.set("query", query.trim());
  if (tag) parameters.set("tag", tag);
  if (sort === "random") parameters.set("seed", randomSeed);
  return `/reading?${parameters.toString()}`;
}

export function IdeasClient() {
  const { status, entries, error, reload } = useIdeas();
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<IdeaFilter>("all");
  const [sort, setSort] = useState<IdeaSort>("updated");
  const [randomSeed, setRandomSeed] = useState("session");
  const [rediscoveryId, setRediscoveryId] = useState<string | null>(null);
  const suggestedThisSession = useRef(new Set<string>());
  const tags = useMemo(() => collectIdeaTags(entries), [entries]);
  const filteredEntries = useMemo(
    () =>
      sortIdeas(
        filterIdeas(entries, query, selectedTag, filter),
        sort,
        randomSeed,
      ),
    [entries, filter, query, randomSeed, selectedTag, sort],
  );
  const rediscovery = useMemo(() => {
    const selected = entries.find(({ note }) => note.id === rediscoveryId);
    if (selected) return selected;
    if (status !== "ready" || entries.length === 0) return null;
    const date = new Date().toISOString().slice(0, 10);
    return chooseRediscovery(entries, date);
  }, [entries, rediscoveryId, status]);
  const noteCount = entries.length;

  useEffect(() => {
    if (!rediscovery || suggestedThisSession.current.has(rediscovery.note.id)) {
      return;
    }
    const stableId = rediscovery.note.id;
    queueMicrotask(() =>
      setRediscoveryId((currentId) => currentId ?? stableId),
    );
    suggestedThisSession.current.add(rediscovery.note.id);
    void noteReadingMetadataRepository
      .recordSuggested(rediscovery.note.id)
      .catch(() => undefined);
  }, [rediscovery]);

  const showAnotherIdea = () => {
    const next = chooseRediscovery(
      entries,
      crypto.randomUUID(),
      rediscovery?.note.id,
    );
    if (next) setRediscoveryId(next.note.id);
  };

  return (
    <div className="page-content">
      <header className="pt-2">
        <p className="text-[0.7rem] font-bold tracking-[0.18em] text-[var(--moss)] uppercase">
          BrainBook
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
          Mes idées
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {status === "loading"
            ? "Rassemblement de vos idées…"
            : `${noteCount} ${noteCount > 1 ? "notes conservées" : "note conservée"}`}
        </p>
      </header>

      {status === "ready" && rediscovery ? (
        <section className="mt-7 rounded-[1.8rem] bg-[var(--moss)] p-5 text-white shadow-[0_10px_28px_rgb(49_95_77_/_0.16)]">
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.1em] text-white/75 uppercase">
            <Icon name="spark" size={17} />
            Une idée à redécouvrir
          </div>
          <p className="mt-4 line-clamp-4 whitespace-pre-line font-serif text-lg leading-7">
            {noteDocumentToPlainText(noteToDocument(rediscovery.note))}
          </p>
          <p className="mt-3 truncate text-xs text-white/70">
            {rediscovery.book.title} · {rediscovery.book.author}
          </p>
          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <Link
              href={`/reading?context=rediscovery&noteId=${rediscovery.note.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[var(--moss)]"
            >
              <Icon name="reader" size={18} />
              Relire
            </Link>
            <button
              type="button"
              onClick={showAnotherIdea}
              disabled={entries.length < 2}
              aria-label="Afficher une autre idée"
              className="flex size-11 items-center justify-center rounded-2xl border border-white/25 text-white disabled:opacity-40"
            >
              <Icon name="shuffle" size={18} />
            </button>
          </div>
        </section>
      ) : null}

      {status === "ready" && noteCount > 0 ? (
        <>
          <section aria-label="Recherche dans les idées" className="mt-7">
            <label className="relative block">
              <span className="sr-only">Rechercher dans toutes les idées</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--muted)]">
                <Icon name="search" size={20} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une idée, un livre, un tag…"
                className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] py-3 pr-4 pl-12 text-base"
              />
            </label>
          </section>

          <section aria-label="Filtrer les idées" className="mt-4 flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`min-h-10 rounded-full px-4 text-xs font-semibold ${
                  filter === item.value
                    ? "bg-[var(--moss)] text-white"
                    : "border border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </section>

          {tags.length > 0 ? (
            <section aria-label="Filtrer par tag" className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => {
                const selected =
                  selectedTag?.toLocaleLowerCase("fr") ===
                  tag.toLocaleLowerCase("fr");
                return (
                  <button
                    key={tag.toLocaleLowerCase("fr")}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedTag(selected ? null : tag)}
                    className={`min-h-9 max-w-full truncate rounded-full px-3 text-xs font-semibold ${
                      selected
                        ? "bg-[var(--clay)] text-white"
                        : "bg-[var(--paper-deep)] text-[var(--muted)]"
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </section>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {filteredEntries.length} résultat
              {filteredEntries.length > 1 ? "s" : ""}
            </p>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              Trier
              <select
                value={sort}
                onChange={(event) => {
                  const nextSort = event.target.value as IdeaSort;
                  setSort(nextSort);
                  if (nextSort === "random") {
                    setRandomSeed(crypto.randomUUID());
                  }
                }}
                className="min-h-10 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="updated">Dernière modification</option>
                <option value="created">Date de création</option>
                <option value="bookTitle">Titre du livre</option>
                <option value="rarelyRead">Les moins relues</option>
                <option value="random">Ordre aléatoire</option>
              </select>
            </label>
          </div>

          {filteredEntries.length > 0 ? (
            <Link
              href={buildReadingHref(
                query,
                selectedTag,
                filter,
                sort,
                randomSeed,
              )}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--moss)] px-5 text-sm font-semibold text-[var(--moss)]"
            >
              <Icon name="reader" size={19} />
              Commencer une lecture
            </Link>
          ) : null}
        </>
      ) : null}

      <section aria-label="Toutes les notes" className="mt-7">
        {status === "loading" ? (
          <div className="grid gap-3" aria-label="Chargement des idées">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-[1.4rem] bg-[var(--card)]"
              />
            ))}
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
            <StatusMessage tone="error">{error}</StatusMessage>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-4 min-h-11 px-3 text-sm font-semibold text-[var(--moss)]"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {status === "ready" && noteCount === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-10 text-center">
            <Icon name="spark" size={25} />
            <h2 className="mt-5 text-lg font-semibold">Vos idées apparaîtront ici</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Ajoutez des passages ou des réflexions depuis vos livres.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white"
            >
              Retour à la bibliothèque
            </Link>
          </div>
        ) : null}

        {status === "ready" && filteredEntries.length > 0 ? (
          <div className="grid gap-3">
            {filteredEntries.map(({ note, book }) => (
              <NoteCard key={note.id} note={note} book={book} />
            ))}
          </div>
        ) : null}

        {status === "ready" && noteCount > 0 && filteredEntries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-9 text-center">
            <Icon name="search" size={24} />
            <h2 className="mt-4 font-semibold">Aucune idée trouvée</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Modifiez la recherche ou retirez les filtres actifs.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedTag(null);
                setFilter("all");
              }}
              className="mt-4 min-h-11 px-4 text-sm font-semibold text-[var(--moss)]"
            >
              Effacer les filtres
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
