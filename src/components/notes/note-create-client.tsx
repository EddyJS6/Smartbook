"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NoteForm } from "@/components/notes/note-form";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useBook } from "@/hooks/use-book";

export function NoteCreateClient() {
  const { id } = useParams<{ id: string }>();
  const { status, book, error, reload } = useBook(id);

  if (status === "loading") {
    return (
      <div className="page-content">
        <BackLink href={`/books/${id}`} label="Fiche du livre" />
        <div className="mt-8 h-72 animate-pulse rounded-3xl bg-[var(--card)]" />
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="page-content flex items-center">
        <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center">
          <Icon name="book" size={27} />
          <h1 className="mt-5 text-2xl font-semibold">Contenu introuvable</h1>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-6 py-3 text-sm font-semibold text-white"
          >
            Retour à la bibliothèque
          </Link>
        </section>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="page-content">
        <BackLink href="/" label="Bibliothèque" />
        <div className="mt-8">
          <StatusMessage tone="error">{error}</StatusMessage>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-4 min-h-11 px-3 text-sm font-semibold text-[var(--moss)]"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return <NoteForm mode="create" book={book} />;
}
