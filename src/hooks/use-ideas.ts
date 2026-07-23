"use client";

import { useCallback, useEffect, useState } from "react";
import type { NoteWithBook } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { bookRepository } from "@/storage/repositories/book-repository";
import { noteRepository } from "@/storage/repositories/note-repository";
import { noteReadingMetadataRepository } from "@/storage/repositories/note-reading-metadata-repository";

type IdeasState =
  | { status: "loading"; entries: NoteWithBook[]; error: null }
  | { status: "ready"; entries: NoteWithBook[]; error: null }
  | { status: "error"; entries: NoteWithBook[]; error: string };

async function loadIdeas(): Promise<NoteWithBook[]> {
  const [notes, books, readingMetadata] = await Promise.all([
    noteRepository.listAll(),
    bookRepository.list(),
    noteReadingMetadataRepository.listAll(),
  ]);
  const booksById = new Map(books.map((book) => [book.id, book]));
  const metadataByNoteId = new Map(
    readingMetadata.map((metadata) => [metadata.noteId, metadata]),
  );

  return notes.flatMap((note) => {
    const book = booksById.get(note.bookId);
    return book
      ? [{ note, book, readingMetadata: metadataByNoteId.get(note.id) }]
      : [];
  });
}

export function useIdeas() {
  const [state, setState] = useState<IdeasState>({
    status: "loading",
    entries: [],
    error: null,
  });

  const reload = useCallback(async () => {
    setState({ status: "loading", entries: [], error: null });

    try {
      setState({ status: "ready", entries: await loadIdeas(), error: null });
    } catch (error) {
      setState({
        status: "error",
        entries: [],
        error: reportStorageError(error).message,
      });
    }
  }, []);

  useEffect(() => {
    let active = true;

    void loadIdeas()
      .then((entries) => {
        if (active) setState({ status: "ready", entries, error: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            entries: [],
            error: reportStorageError(error).message,
          });
        }
      });

    const handleMetadata = () => {
      void loadIdeas().then((entries) => {
        if (active) setState({ status: "ready", entries, error: null });
      });
    };
    window.addEventListener("brainbook:reading-metadata", handleMetadata);

    return () => {
      active = false;
      window.removeEventListener("brainbook:reading-metadata", handleMetadata);
    };
  }, []);

  return { ...state, reload };
}
