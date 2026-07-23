import type { BookInput, BookStatus } from "@/domain/models";

export type BookFieldErrors = Partial<Record<"title" | "author", string>>;

export type BookFormValues = {
  title: string;
  author: string;
  status: BookStatus;
};

export type BookValidationResult =
  | {
      success: true;
      data: BookInput;
      errors: BookFieldErrors;
    }
  | {
      success: false;
      data: BookInput;
      errors: BookFieldErrors;
    };

export function normalizeBookText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateBook(values: BookFormValues): BookValidationResult {
  const data: BookInput = {
    title: normalizeBookText(values.title),
    author: normalizeBookText(values.author),
    status: values.status,
  };
  const errors: BookFieldErrors = {};

  if (!data.title) {
    errors.title = "Indiquez le titre du livre.";
  }

  if (!data.author) {
    errors.author = "Indiquez le nom de l’auteur.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, data, errors };
  }

  return { success: true, data, errors: {} };
}
