"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookNote } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { noteRepository } from "@/storage/repositories/note-repository";

type NoteState =
  | { id: string; status: "loading"; note: null; error: null }
  | { id: string; status: "ready"; note: BookNote; error: null }
  | { id: string; status: "missing"; note: null; error: null }
  | { id: string; status: "error"; note: null; error: string };

export function useNote(id: string) {
  const [state, setState] = useState<NoteState>({
    id,
    status: "loading",
    note: null,
    error: null,
  });
  const fetchNote = useCallback(() => noteRepository.get(id), [id]);

  const reload = useCallback(async () => {
    setState({ id, status: "loading", note: null, error: null });

    try {
      const note = await fetchNote();
      setState(
        note
          ? { id, status: "ready", note, error: null }
          : { id, status: "missing", note: null, error: null },
      );
    } catch (error) {
      setState({
        id,
        status: "error",
        note: null,
        error: reportStorageError(error).message,
      });
    }
  }, [fetchNote, id]);

  useEffect(() => {
    let active = true;

    void fetchNote()
      .then((note) => {
        if (!active) return;
        setState(
          note
            ? { id, status: "ready", note, error: null }
            : { id, status: "missing", note: null, error: null },
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            id,
            status: "error",
            note: null,
            error: reportStorageError(error).message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [fetchNote, id]);

  if (state.id !== id) {
    return {
      id,
      status: "loading" as const,
      note: null,
      error: null,
      reload,
    };
  }

  return { ...state, reload };
}
