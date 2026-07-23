"use client";

import { useEffect, useState } from "react";
import type { UUID } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { noteRepository } from "@/storage/repositories/note-repository";

export function useNoteCounts() {
  const [counts, setCounts] = useState<Partial<Record<UUID, number>>>({});

  useEffect(() => {
    let active = true;

    void noteRepository
      .listAll()
      .then((notes) => {
        if (!active) return;

        const nextCounts: Partial<Record<UUID, number>> = {};
        for (const note of notes) {
          nextCounts[note.bookId] = (nextCounts[note.bookId] ?? 0) + 1;
        }
        setCounts(nextCounts);
      })
      .catch((error: unknown) => {
        reportStorageError(error);
      });

    return () => {
      active = false;
    };
  }, []);

  return counts;
}
