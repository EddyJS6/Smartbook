"use client";

import { useState } from "react";
import type { Book } from "@/domain/models";
import { BookCover } from "@/components/books/book-cover";
import { Icon } from "@/components/ui/icon";

type ContentArtworkProps = {
  content: Book;
  className?: string;
  priority?: boolean;
};

export function ContentArtwork({
  content,
  className = "",
  priority = false,
}: ContentArtworkProps) {
  const [failed, setFailed] = useState(false);
  if (content.contentType !== "video") {
    return (
      <BookCover book={content} className={className} priority={priority} />
    );
  }

  return (
    <div
      className={`relative isolate overflow-hidden bg-[#1f211f] text-white ${className}`}
    >
      {content.thumbnailUrl && !failed ? (
        // The URL is generated from a validated YouTube video id.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.thumbnailUrl}
          alt={`Miniature de ${content.title}`}
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full min-h-24 items-center justify-center">
          <Icon name="video" size={30} />
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/15">
        <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-[#c4302b] shadow-lg">
          <Icon name="play" size={21} />
        </span>
      </span>
    </div>
  );
}
