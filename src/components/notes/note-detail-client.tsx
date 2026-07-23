"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookCover } from "@/components/books/book-cover";
import { TagPill } from "@/components/notes/tag-pill";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useBook } from "@/hooks/use-book";
import { useNote } from "@/hooks/use-note";
import { formatLongDate } from "@/lib/format-date";
import { reportStorageError } from "@/storage/errors";
import { noteRepository } from "@/storage/repositories/note-repository";

function InvalidNoteState({ bookId }: { bookId: string }) {
  return (
    <div className="page-content flex items-center">
      <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
          <Icon name="note" size={25} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Note introuvable</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Cette note n’existe plus ou n’appartient pas au livre indiqué.
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            href={`/books/${bookId}`}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            Retour au livre
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[var(--moss)]"
          >
            Retour à la bibliothèque
          </Link>
        </div>
      </section>
    </div>
  );
}

export function NoteDetailClient() {
  const { id: bookId, noteId } = useParams<{
    id: string;
    noteId: string;
  }>();
  const router = useRouter();
  const bookState = useBook(bookId);
  const noteState = useNote(noteId);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const nextNotice =
      parameters.get("updated") === "1"
        ? "Les modifications de la note ont bien été enregistrées."
        : null;

    if (parameters.has("updated")) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    const noticeTimer = nextNotice
      ? window.setTimeout(() => setNotice(nextNotice), 0)
      : undefined;

    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
    };
  }, []);

  const deleteNote = async () => {
    if (noteState.status !== "ready" || isDeleting) return;

    const preview =
      noteState.note.extractedText ||
      noteState.note.personalReflection ||
      "cette note";
    const shortPreview =
      preview.length > 80 ? `${preview.slice(0, 80)}…` : preview;
    const confirmed = window.confirm(
      `Supprimer définitivement « ${shortPreview} » de cet appareil ? Aucune sauvegarde distante n’est encore disponible.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const deleted = await noteRepository.delete(noteState.note.id);
      if (!deleted) {
        setDeleteError("Cette note n’existe plus sur cet appareil.");
        setIsDeleting(false);
        return;
      }
      router.replace(`/books/${bookId}?noteDeleted=1`);
    } catch (error) {
      setDeleteError(reportStorageError(error).message);
      setIsDeleting(false);
    }
  };

  if (bookState.status === "loading" || noteState.status === "loading") {
    return (
      <div className="page-content">
        <BackLink href={`/books/${bookId}`} label="Fiche du livre" />
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
    return <InvalidNoteState bookId={bookId} />;
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

  const { book } = bookState;
  const { note } = noteState;
  const wasModified = note.updatedAt !== note.createdAt;

  return (
    <div className="page-content">
      <header className="flex items-center justify-between gap-4 pt-1">
        <BackLink href={`/books/${book.id}`} label="Fiche du livre" />
        <details className="relative">
          <summary
            aria-label="Actions de la note"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--moss)] [&::-webkit-details-marker]:hidden"
          >
            <Icon name="more" size={22} />
          </summary>
          <div className="absolute top-12 right-0 z-20 w-52 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-[0_12px_32px_rgb(48_39_30_/_0.14)]">
            <Link
              href={`/books/${book.id}/notes/${note.id}/edit`}
              className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold"
            >
              <Icon name="edit" size={17} />
              Modifier
            </Link>
            <button
              type="button"
              onClick={() => void deleteNote()}
              disabled={isDeleting}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-[var(--clay)] disabled:opacity-60"
            >
              <Icon name="trash" size={17} />
              {isDeleting ? "Suppression…" : "Supprimer la note"}
            </button>
          </div>
        </details>
      </header>

      {notice ? (
        <div className="mt-5">
          <StatusMessage tone="success">{notice}</StatusMessage>
        </div>
      ) : null}
      {deleteError ? (
        <div className="mt-5">
          <StatusMessage tone="error">{deleteError}</StatusMessage>
        </div>
      ) : null}

      <section className="mt-6 flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-3">
        <BookCover
          book={book}
          className="aspect-[2/3] w-14 shrink-0 rounded-xl shadow-sm"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{book.title}</p>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">
            {book.author}
          </p>
        </div>
      </section>

      {note.extractedText ? (
        <article className="mt-7 rounded-[1.8rem] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
            Passage du livre
          </p>
          <div className="mt-4 whitespace-pre-wrap break-words font-serif text-[1.08rem] leading-8 text-[var(--ink)]">
            {note.extractedText}
          </div>
          {note.pageNumber ? (
            <p className="mt-5 border-t border-[var(--line)] pt-4 text-xs font-semibold text-[var(--muted)]">
              Page ou référence · {note.pageNumber}
            </p>
          ) : null}
        </article>
      ) : null}

      {note.personalReflection ? (
        <section className="mt-5 rounded-[1.8rem] bg-[#ece5da] p-6">
          <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--moss)] uppercase">
            Ma réflexion
          </p>
          <div className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-[var(--ink)]">
            {note.personalReflection}
          </div>
          {!note.extractedText && note.pageNumber ? (
            <p className="mt-5 border-t border-[#d9cebd] pt-4 text-xs font-semibold text-[var(--muted)]">
              Page ou référence · {note.pageNumber}
            </p>
          ) : null}
        </section>
      ) : null}

      {note.tags.length > 0 ? (
        <section aria-label="Tags" className="mt-6 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <TagPill key={tag.toLocaleLowerCase("fr")} tag={tag} />
          ))}
        </section>
      ) : null}

      <footer className="mt-7 text-center text-xs leading-5 text-[var(--muted)]">
        <p>Créée le {formatLongDate(note.createdAt)}</p>
        {wasModified ? (
          <p>Modifiée le {formatLongDate(note.updatedAt)}</p>
        ) : null}
      </footer>
    </div>
  );
}
