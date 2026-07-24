"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ContentArtwork } from "@/components/books/content-artwork";
import { BookNotesSection } from "@/components/notes/book-notes-section";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { bookStatusLabels } from "@/domain/book-status";
import { useBook } from "@/hooks/use-book";
import { reportStorageError } from "@/storage/errors";
import { bookRepository } from "@/storage/repositories/book-repository";

function formatBookDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function BookDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, book, error, reload } = useBook(id);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isVideo = book?.contentType === "video";
  const contentType = book?.contentType;

  useEffect(() => {
    if (status !== "ready") return;
    const parameters = new URLSearchParams(window.location.search);
    let nextNotice: string | null = null;

    if (parameters.get("created") === "1") {
      nextNotice =
        contentType === "video"
          ? "La vidéo a bien été ajoutée à votre bibliothèque."
          : "Le livre a bien été ajouté à votre bibliothèque.";
    } else if (parameters.get("updated") === "1") {
      nextNotice = "Les modifications ont bien été enregistrées.";
    } else if (parameters.get("noteCreated") === "1") {
      nextNotice = "La note a bien été ajoutée.";
    } else if (parameters.get("noteDeleted") === "1") {
      nextNotice = "La note a été supprimée de cet appareil.";
    }

    if (
      parameters.has("created") ||
      parameters.has("updated") ||
      parameters.has("noteCreated") ||
      parameters.has("noteDeleted")
    ) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    const noticeTimer = nextNotice
      ? window.setTimeout(() => setNotice(nextNotice), 0)
      : undefined;

    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
    };
  }, [contentType, status]);

  const deleteBook = async () => {
    if (!book || isDeleting) return;

    const confirmed = window.confirm(
      `Supprimer « ${book.title} » ? ${book.contentType === "video" ? "La vidéo" : "Le livre, sa couverture"} et toutes ses notes disparaîtront immédiatement de cet appareil, puis de la sauvegarde cloud lors de la prochaine synchronisation.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const deleted = await bookRepository.delete(book.id);
      if (!deleted) {
        setDeleteError(
          `Ce ${book.contentType === "video" ? "contenu vidéo" : "livre"} n’existe plus dans votre bibliothèque.`,
        );
        setIsDeleting(false);
        return;
      }
      router.replace(
        `/?deleted=${book.contentType === "video" ? "video" : "book"}`,
      );
    } catch (deleteFailure) {
      setDeleteError(reportStorageError(deleteFailure).message);
      setIsDeleting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="page-content">
        <BackLink href="/" label="Bibliothèque" />
        <div
          className="mt-12 animate-pulse rounded-[2rem] bg-[var(--card)] p-7"
          aria-label="Chargement du livre"
        >
          <div className="mx-auto aspect-[2/3] w-48 rounded-3xl bg-[var(--paper-deep)]" />
          <div className="mx-auto mt-8 h-7 w-2/3 rounded bg-[var(--paper-deep)]" />
        </div>
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="page-content flex items-center">
        <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
            <Icon name="book" size={25} />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
            Contenu introuvable
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Ce contenu a peut-être été supprimé ou son adresse n’est plus valide.
          </p>
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

  return (
    <div className="page-content">
      <header className="flex items-center justify-between gap-4 pt-1">
        <BackLink href="/" label="Bibliothèque" />
        <details className="relative">
          <summary
            aria-label="Actions du livre"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--moss)] [&::-webkit-details-marker]:hidden"
          >
            <Icon name="more" size={22} />
          </summary>
          <div className="absolute top-12 right-0 z-20 w-52 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-[0_12px_32px_rgb(48_39_30_/_0.14)]">
            {!isVideo ? (
              <Link
                href={`/books/${book.id}/edit`}
                className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-[var(--ink)]"
              >
                <Icon name="edit" size={17} />
                Modifier
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void deleteBook()}
              disabled={isDeleting}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-[var(--clay)] disabled:opacity-60"
            >
              <Icon name="trash" size={17} />
              {isDeleting
                ? "Suppression…"
                : `Supprimer ${isVideo ? "la vidéo" : "le livre"}`}
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

      <section className="pt-7 text-center">
        <ContentArtwork
          content={book}
          priority
          className={`mx-auto w-full rounded-[1.8rem] shadow-[0_16px_38px_rgb(48_39_30_/_0.18)] ${
            isVideo ? "aspect-video" : "aspect-[2/3] max-w-[15rem]"
          }`}
        />
        <span className="mt-7 inline-flex rounded-full bg-[var(--moss-soft)] px-3 py-1.5 text-[0.68rem] font-bold tracking-[0.05em] text-[var(--moss)] uppercase">
          {isVideo ? "Vidéo YouTube" : bookStatusLabels[book.status]}
        </span>
        <h1 className="balance mt-4 text-[2rem] leading-[1.08] font-semibold tracking-[-0.04em]">
          {book.title}
        </h1>
        <p className="mt-2 text-base text-[var(--muted)]">{book.author}</p>
        <p className="mt-4 text-xs text-[#918c81]">
          Ajouté le {formatBookDate(book.createdAt)}
        </p>
        {isVideo && book.youtubeUrl ? (
          <a
            href={book.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#c4302b] px-5 text-sm font-semibold text-white"
          >
            <Icon name="play" size={18} />
            Voir sur YouTube
          </a>
        ) : null}
      </section>

      <BookNotesSection bookId={book.id} contentType={book.contentType ?? "book"} />
    </div>
  );
}
