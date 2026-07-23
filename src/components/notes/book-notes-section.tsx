"use client";

import Link from "next/link";
import { NoteCard } from "@/components/notes/note-card";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useBookNotes } from "@/hooks/use-book-notes";

type BookNotesSectionProps = {
  bookId: string;
};

export function BookNotesSection({ bookId }: BookNotesSectionProps) {
  const { status, notes, error, reload } = useBookNotes(bookId);
  const noteLabel = notes.length > 1 ? "notes" : "note";

  return (
    <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-[var(--clay)] uppercase">
            Carnet de lecture
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]">
            Mes notes
          </h2>
        </div>
        <span className="rounded-full bg-[var(--paper)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
          {status === "loading" ? "…" : `${notes.length} ${noteLabel}`}
        </span>
      </div>

      {status === "loading" ? (
        <div
          className="mt-6 h-36 animate-pulse rounded-2xl bg-[var(--paper)]"
          aria-label="Chargement des notes"
        />
      ) : null}

      {status === "error" ? (
        <div className="mt-6">
          <StatusMessage tone="error">{error}</StatusMessage>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 min-h-11 px-3 text-sm font-semibold text-[var(--moss)]"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {status === "ready" && notes.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-[var(--paper)] px-5 py-7 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
            <Icon name="note" size={22} />
          </span>
          <h3 className="mt-4 font-semibold">Aucune note pour le moment</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Conservez ici les passages et réflexions qui comptent pour vous.
          </p>
          <Link
            href={`/books/${bookId}/notes/new`}
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            <Icon name="plus" size={18} />
            Ajouter ma première note
          </Link>
        </div>
      ) : null}

      {status === "ready" && notes.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : null}

      {status === "ready" && notes.length > 0 ? (
        <Link
          href={`/books/${bookId}/notes/new`}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--moss)] px-5 py-3 text-sm font-semibold text-[var(--moss)]"
        >
          <Icon name="plus" size={18} />
          Ajouter une note
        </Link>
      ) : null}
    </section>
  );
}
