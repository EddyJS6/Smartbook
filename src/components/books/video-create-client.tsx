"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { YouTubeVideoMetadata } from "@/domain/youtube-video";
import { parseYouTubeVideoId } from "@/domain/youtube-video";
import { normalizeBookText } from "@/domain/book-validation";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { reportStorageError } from "@/storage/errors";
import { bookRepository } from "@/storage/repositories/book-repository";

const fieldClassName =
  "min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-base text-[var(--ink)] placeholder:text-[#969187]";

type MetadataResponse =
  | YouTubeVideoMetadata
  | {
      error: string;
    };

export function VideoCreateClient() {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [metadata, setMetadata] = useState<YouTubeVideoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadMetadata = async (): Promise<YouTubeVideoMetadata | null> => {
    const submittedUrl = youtubeUrl.trim();
    if (!parseYouTubeVideoId(submittedUrl)) {
      setError("Saisissez un lien vers une vidéo YouTube valide.");
      setMetadata(null);
      return null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/youtube-metadata?url=${encodeURIComponent(submittedUrl)}`,
      );
      const payload = (await response.json()) as MetadataResponse;
      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Impossible de récupérer cette vidéo.",
        );
      }
      setMetadata(payload);
      return payload;
    } catch (failure) {
      setMetadata(null);
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossible de récupérer cette vidéo.",
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const normalizedAuthor = normalizeBookText(author);
    if (!normalizedAuthor) {
      setError("Indiquez le nom de l’auteur ou de l’intervenant.");
      return;
    }
    const loadedMetadata =
      metadata?.videoId === parseYouTubeVideoId(youtubeUrl)
        ? metadata
        : await loadMetadata();
    if (!loadedMetadata) return;

    setIsSaving(true);
    try {
      const video = await bookRepository.createVideo({
        title: loadedMetadata.title,
        author: normalizedAuthor,
        youtubeUrl: loadedMetadata.canonicalUrl,
        youtubeVideoId: loadedMetadata.videoId,
        thumbnailUrl: loadedMetadata.thumbnailUrl,
      });
      router.replace(`/books/${video.id}?created=1`);
    } catch (failure) {
      setError(reportStorageError(failure).message);
      setIsSaving(false);
    }
  };

  return (
    <div className="page-content">
      <BackLink href="/?type=videos" label="Mes vidéos" />
      <header className="mt-5">
        <p className="text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
          Nouvelle ressource
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
          Ajouter une vidéo
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Collez un lien YouTube : BrainBook récupère automatiquement le titre
          et la miniature.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="mt-7 space-y-6">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <div>
          <label htmlFor="youtube-url" className="mb-2 block text-sm font-semibold">
            Lien de la vidéo YouTube
          </label>
          <input
            id="youtube-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={youtubeUrl}
            onChange={(event) => {
              setYoutubeUrl(event.target.value);
              setMetadata(null);
              setError(null);
            }}
            onBlur={() => {
              if (youtubeUrl.trim()) void loadMetadata();
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="video-author" className="mb-2 block text-sm font-semibold">
            Auteur ou intervenant
          </label>
          <input
            id="video-author"
            type="text"
            maxLength={300}
            value={author}
            onChange={(event) => {
              setAuthor(event.target.value);
              setError(null);
            }}
            placeholder="Nom de la personne ou de la chaîne"
            className={fieldClassName}
          />
        </div>

        {isLoading ? (
          <div className="flex min-h-28 items-center justify-center rounded-3xl bg-[var(--card)] text-sm text-[var(--muted)]">
            Récupération des informations YouTube…
          </div>
        ) : null}

        {metadata ? (
          <section className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)]">
            {/* The URL is generated server-side from a validated YouTube id. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={metadata.thumbnailUrl}
              alt=""
              className="aspect-video w-full object-cover"
            />
            <div className="p-4">
              <p className="text-xs font-semibold text-[var(--moss)]">
                Vidéo trouvée
              </p>
              <h2 className="mt-1 font-semibold">{metadata.title}</h2>
            </div>
          </section>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-55"
        >
          <Icon name="plus" size={19} />
          {isSaving ? "Ajout en cours…" : "Ajouter cette vidéo"}
        </button>

        <Link
          href="/?type=videos"
          className="flex min-h-11 items-center justify-center text-sm font-semibold text-[var(--muted)]"
        >
          Annuler
        </Link>
      </form>
    </div>
  );
}
