import type {
  BookNote,
  NoteDocument,
  NoteTextRun,
  NoteTextSize,
} from "@/domain/models";

export const MAX_NOTE_CONTENT_LENGTH = 100_000;

const NOTE_TEXT_SIZES = new Set<NoteTextSize>([
  "small",
  "normal",
  "large",
]);

function sameFormatting(left: NoteTextRun, right: NoteTextRun): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.size === right.size
  );
}

export function parseNoteDocument(value: unknown): NoteDocument | null {
  if (!Array.isArray(value)) return null;

  const document: NoteDocument = [];
  let remainingCharacters = MAX_NOTE_CONTENT_LENGTH;

  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof candidate.text !== "string" ||
      typeof candidate.bold !== "boolean" ||
      typeof candidate.italic !== "boolean" ||
      typeof candidate.underline !== "boolean" ||
      typeof candidate.size !== "string" ||
      !NOTE_TEXT_SIZES.has(candidate.size as NoteTextSize)
    ) {
      return null;
    }

    if (remainingCharacters <= 0) break;
    const text = candidate.text
      .replace(/\r\n?/g, "\n")
      .slice(0, remainingCharacters);
    remainingCharacters -= text.length;
    if (!text) continue;

    const run: NoteTextRun = {
      text,
      bold: candidate.bold,
      italic: candidate.italic,
      underline: candidate.underline,
      size: candidate.size as NoteTextSize,
    };
    const previous = document.at(-1);
    if (previous && sameFormatting(previous, run)) {
      previous.text += run.text;
    } else {
      document.push(run);
    }
  }

  return document;
}

export function documentFromPlainText(text: string): NoteDocument {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_NOTE_CONTENT_LENGTH);
  if (!normalized) return [];

  return [
    {
      text: normalized,
      bold: false,
      italic: false,
      underline: false,
      size: "normal",
    },
  ];
}

export function noteDocumentToPlainText(document: NoteDocument): string {
  return document.map((run) => run.text).join("");
}

export function noteToDocument(
  note: Pick<
    BookNote,
    "formattedContent" | "extractedText" | "personalReflection"
  >,
): NoteDocument {
  if (note.formattedContent !== null && note.formattedContent !== undefined) {
    const parsed = parseNoteDocument(note.formattedContent);
    if (parsed) return parsed;
  }

  return documentFromPlainText(
    [note.extractedText, note.personalReflection].filter(Boolean).join("\n\n"),
  );
}

export function appendPlainTextToDocument(
  document: NoteDocument,
  text: string,
): NoteDocument {
  const currentText = noteDocumentToPlainText(document);
  const separator = currentText && !/\s$/.test(currentText) ? " " : "";
  return (
    parseNoteDocument([
      ...document,
      {
        text: `${separator}${text}`,
        bold: false,
        italic: false,
        underline: false,
        size: "normal",
      },
    ]) ?? document
  );
}
