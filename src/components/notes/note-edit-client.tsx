"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NoteForm } from "@/components/notes/note-form";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useBook } from "@/hooks/use-book";
import { useNote } from "@/hooks/use-note";

export function NoteEditClient() {
  const { id: bookId, noteId } = useParams<{
    id: string;
    noteId: string;
  }>();
  const bookState = useBook(bookId);
  const noteState = useNote(noteId);

  if (bookState.status === "loading" || noteState.status === "loading") {
    return (
      <div className="page-content">
        <BackLink
          href={`/books/${bookId}/notes/${noteId}`}
          label="Retour à la note"
        />
        <div className="mt-8 h-80 animate-pulse rounded-3xl bg-[var(--card)]" />
      </div>
    );
  }

  if (
    bookState.status === "missing" ||
    noteState.status === "missing" ||
    (noteState.status === "ready" &&
      noteState.note.bookId !== bookId)
  ) {
    return (
      <div className="page-content flex items-center">
        <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center">
          <Icon name="note" size={27} />
          <h1 className="mt-5 text-2xl font-semibold">Note introuvable</h1>
          <Link
            href={`/books/${bookId}`}
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-6 py-3 text-sm font-semibold text-white"
          >
            Retour au livre
          </Link>
        </section>
      </div>
    );
  }

  if (bookState.status === "error" || noteState.status === "error") {
    const error =
      bookState.status === "error" ? bookState.error : noteState.error;

    return (
      <div className="page-content">
        <BackLink href={`/books/${bookId}`} label="Fiche du livre" />
        <div className="mt-8">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      </div>
    );
  }

  return <NoteForm mode="edit" book={bookState.book} note={noteState.note} />;
}
