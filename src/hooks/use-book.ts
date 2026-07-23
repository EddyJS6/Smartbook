"use client";

import { useCallback, useEffect, useState } from "react";
import type { Book } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { bookRepository } from "@/storage/repositories/book-repository";

type BookState =
  | { id: string; status: "loading"; book: null; error: null }
  | { id: string; status: "ready"; book: Book; error: null }
  | { id: string; status: "missing"; book: null; error: null }
  | { id: string; status: "error"; book: null; error: string };

export function useBook(id: string) {
  const [state, setState] = useState<BookState>({
    id,
    status: "loading",
    book: null,
    error: null,
  });

  const fetchBook = useCallback(() => bookRepository.get(id), [id]);

  const reload = useCallback(async () => {
    setState({ id, status: "loading", book: null, error: null });

    try {
      const book = await fetchBook();
      setState(
        book
          ? { id, status: "ready", book, error: null }
          : { id, status: "missing", book: null, error: null },
      );
    } catch (error) {
      const storageError = reportStorageError(error);
      setState({
        id,
        status: "error",
        book: null,
        error: storageError.message,
      });
    }
  }, [fetchBook, id]);

  useEffect(() => {
    let active = true;

    void fetchBook()
      .then((book) => {
        if (!active) return;
        setState(
          book
            ? { id, status: "ready", book, error: null }
            : { id, status: "missing", book: null, error: null },
        );
      })
      .catch((error: unknown) => {
        const storageError = reportStorageError(error);
        if (active) {
          setState({
            id,
            status: "error",
            book: null,
            error: storageError.message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [fetchBook, id]);

  if (state.id !== id) {
    return {
      id,
      status: "loading" as const,
      book: null,
      error: null,
      reload,
    };
  }

  return { ...state, reload };
}
