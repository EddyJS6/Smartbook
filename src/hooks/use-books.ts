"use client";

import { useCallback, useEffect, useState } from "react";
import type { Book } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { bookRepository } from "@/storage/repositories/book-repository";

type BooksState =
  | { status: "loading"; books: Book[]; error: null }
  | { status: "ready"; books: Book[]; error: null }
  | { status: "error"; books: Book[]; error: string };

export function useBooks() {
  const [state, setState] = useState<BooksState>({
    status: "loading",
    books: [],
    error: null,
  });

  const reload = useCallback(async () => {
    setState((current) => ({
      status: "loading",
      books: current.books,
      error: null,
    }));

    try {
      const books = await bookRepository.list();
      setState({ status: "ready", books, error: null });
    } catch (error) {
      const storageError = reportStorageError(error);
      setState({
        status: "error",
        books: [],
        error: storageError.message,
      });
    }
  }, []);

  useEffect(() => {
    let active = true;

    void bookRepository
      .list()
      .then((books) => {
        if (active) setState({ status: "ready", books, error: null });
      })
      .catch((error: unknown) => {
        const storageError = reportStorageError(error);
        if (active) {
          setState({
            status: "error",
            books: [],
            error: storageError.message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { ...state, reload };
}
