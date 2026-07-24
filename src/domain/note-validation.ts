import type { BookNoteInput, NoteDocument } from "@/domain/models";
import {
  noteDocumentToPlainText,
  parseNoteDocument,
} from "@/domain/note-document";

export const MAX_TAG_LENGTH = 30;
export const MAX_TAGS = 12;

export type NoteFormValues = {
  title?: string;
  extractedText: string;
  personalReflection: string;
  pageNumber: string;
  tags: string[];
  formattedContent?: NoteDocument | null;
};

export type NoteFieldErrors = Partial<Record<"content" | "tags", string>>;

export type NoteValidationResult =
  | {
      success: true;
      data: BookNoteInput;
      errors: NoteFieldErrors;
    }
  | {
      success: false;
      data: BookNoteInput;
      errors: NoteFieldErrors;
    };

export function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function normalizeNoteTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizePageReference(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

export function normalizeTags(values: readonly string[]): string[] {
  const uniqueTags = new Map<string, string>();

  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag) continue;

    const key = tag.toLocaleLowerCase("fr");
    if (!uniqueTags.has(key)) {
      uniqueTags.set(key, tag);
    }

    if (uniqueTags.size >= MAX_TAGS) break;
  }

  return [...uniqueTags.values()];
}

export function validateTagCandidate(
  value: string,
  currentTags: readonly string[],
): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) return null;
  if (trimmed.length > MAX_TAG_LENGTH) {
    return `Un tag ne peut pas dépasser ${MAX_TAG_LENGTH} caractères.`;
  }
  if (currentTags.length >= MAX_TAGS) {
    return `Vous pouvez ajouter jusqu’à ${MAX_TAGS} tags.`;
  }

  return null;
}

export function validateNote(values: NoteFormValues): NoteValidationResult {
  const formattedContent =
    values.formattedContent === null ||
    values.formattedContent === undefined
      ? null
      : parseNoteDocument(values.formattedContent);
  const formattedPlainText = formattedContent
    ? normalizeMultilineText(noteDocumentToPlainText(formattedContent))
    : "";
  const data: BookNoteInput = {
    title: normalizeNoteTitle(values.title ?? ""),
    formattedContent,
    extractedText:
      formattedContent === null
        ? normalizeMultilineText(values.extractedText)
        : formattedPlainText,
    personalReflection:
      formattedContent === null
        ? normalizeMultilineText(values.personalReflection)
        : "",
    pageNumber: normalizePageReference(values.pageNumber),
    tags: normalizeTags(values.tags),
  };
  const errors: NoteFieldErrors = {};

  if (!data.extractedText && !data.personalReflection) {
    errors.content =
      "Ajoutez au moins une idée ou une réflexion personnelle.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, data, errors };
  }

  return { success: true, data, errors: {} };
}
