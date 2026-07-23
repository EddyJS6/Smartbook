"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NoteCard } from "@/components/notes/note-card";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { collectIdeaTags, filterIdeas } from "@/domain/note-search";
import { useIdeas } from "@/hooks/use-ideas";

export function IdeasClient() {
  const { status, entries, error, reload } = useIdeas();
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const tags = useMemo(() => collectIdeaTags(entries), [entries]);
  const filteredEntries = useMemo(
    () => filterIdeas(entries, query, selectedTag),
    [entries, query, selectedTag],
  );
  const noteCount = entries.length;

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
        <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--muted)]">
          Toutes les idées que vous avez conservées au fil de vos lectures.
        </p>
      </header>

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
                className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] py-3 pr-4 pl-12 text-base shadow-[0_2px_12px_rgb(48_39_30_/_0.035)] placeholder:text-[#969187]"
              />
            </label>
          </section>

          {tags.length > 0 ? (
            <section aria-label="Filtrer par tag" className="mt-4">
              <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
                <button
                  type="button"
                  aria-pressed={selectedTag === null}
                  onClick={() => setSelectedTag(null)}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${
                    selectedTag === null
                      ? "bg-[var(--moss)] text-white"
                      : "border border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
                  }`}
                >
                  Toutes
                </button>
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
                      className={`min-h-10 max-w-48 shrink-0 truncate rounded-full px-4 text-xs font-semibold ${
                        selected
                          ? "bg-[var(--moss)] text-white"
                          : "border border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>
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
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
              <Icon name="spark" size={25} />
            </span>
            <h2 className="mt-5 text-lg font-semibold">
              Vos idées apparaîtront ici
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
              Ajoutez des passages ou des réflexions depuis vos livres pour les
              retrouver dans un même espace.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
            >
              Retour à la bibliothèque
            </Link>
          </div>
        ) : null}

        {status === "ready" &&
        noteCount > 0 &&
        filteredEntries.length > 0 ? (
          <div className="grid gap-3">
            {filteredEntries.map(({ note, book }) => (
              <NoteCard key={note.id} note={note} book={book} />
            ))}
          </div>
        ) : null}

        {status === "ready" &&
        noteCount > 0 &&
        filteredEntries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-9 text-center">
            <Icon name="search" size={24} />
            <h2 className="mt-4 font-semibold">Aucune idée trouvée</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Modifiez la recherche ou retirez le filtre actif.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedTag(null);
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
