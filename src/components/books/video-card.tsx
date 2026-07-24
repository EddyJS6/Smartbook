import Link from "next/link";
import type { Book } from "@/domain/models";
import { ContentArtwork } from "@/components/books/content-artwork";
import { Icon } from "@/components/ui/icon";

export function VideoCard({
  video,
  noteCount,
}: {
  video: Book;
  noteCount: number;
}) {
  return (
    <Link
      href={`/books/${video.id}`}
      className="book-card overflow-hidden rounded-[1.4rem] border border-[var(--line)] bg-[var(--card)] shadow-[0_4px_18px_rgb(48_39_30_/_0.045)]"
      aria-label={`Ouvrir la vidéo ${video.title}`}
    >
      <ContentArtwork
        content={video}
        className="aspect-video w-full border-b border-[var(--line)]"
      />
      <article className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[1.05rem] leading-snug font-semibold tracking-[-0.02em]">
              {video.title}
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--muted)]">
              {video.author}
            </p>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--moss)]">
            <Icon name="chevron" size={17} />
          </span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Icon name="note" size={15} />
          {noteCount} {noteCount > 1 ? "notes" : "note"}
        </p>
      </article>
    </Link>
  );
}
