"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookNote } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { noteRepository } from "@/storage/repositories/note-repository";

type NotesState =
  | { bookId: string; status: "loading"; notes: BookNote[]; error: null }
  | { bookId: string; status: "ready"; notes: BookNote[]; error: null }
  | { bookId: string; status: "error"; notes: BookNote[]; error: string };

export function useBookNotes(bookId: string) {
  const [state, setState] = useState<NotesState>({
    bookId,
    status: "loading",
    notes: [],
    error: null,
  });
  const fetchNotes = useCallback(
    () => noteRepository.listByBook(bookId),
    [bookId],
  );

  const reload = useCallback(async () => {
    setState({
      bookId,
      status: "loading",
      notes: [],
      error: null,
    });

    try {
      const notes = await fetchNotes();
      setState({ bookId, status: "ready", notes, error: null });
    } catch (error) {
      setState({
        bookId,
        status: "error",
        notes: [],
        error: reportStorageError(error).message,
      });
    }
  }, [bookId, fetchNotes]);

  useEffect(() => {
    let active = true;

    void fetchNotes()
      .then((notes) => {
        if (active) {
          setState({ bookId, status: "ready", notes, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            bookId,
            status: "error",
            notes: [],
            error: reportStorageError(error).message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [bookId, fetchNotes]);

  if (state.bookId !== bookId) {
    return {
      bookId,
      status: "loading" as const,
      notes: [],
      error: null,
      reload,
    };
  }

  return { ...state, reload };
}
