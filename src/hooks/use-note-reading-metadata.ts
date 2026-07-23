"use client";

import { useCallback, useEffect, useState } from "react";
import type { NoteReadingMetadata, UUID } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { noteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";

export function useNoteReadingMetadata(noteId: UUID) {
  const [metadata, setMetadata] = useState<NoteReadingMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMetadata(await noteReadingMetadataRepository.getOrCreate(noteId));
      setError(null);
    } catch (failure) {
      setError(reportStorageError(failure).message);
    }
  }, [noteId]);

  useEffect(() => {
    let active = true;
    void noteReadingMetadataRepository
      .getOrCreate(noteId)
      .then((nextMetadata) => {
        if (active) {
          setMetadata(nextMetadata);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active) setError(reportStorageError(failure).message);
      });
    const handleChange = (event: Event) => {
      const changedNoteId = (event as CustomEvent<{ noteId?: UUID }>).detail
        ?.noteId;
      if (!changedNoteId || changedNoteId === noteId) void reload();
    };
    window.addEventListener("brainbook:reading-metadata", handleChange);
    return () => {
      active = false;
      window.removeEventListener("brainbook:reading-metadata", handleChange);
    };
  }, [noteId, reload]);

  return { metadata, error, reload };
}
