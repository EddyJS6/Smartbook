import { describe, expect, it } from "vitest";
import {
  appendPlainTextToDocument,
  documentFromPlainText,
  noteDocumentToPlainText,
  noteToDocument,
  parseNoteDocument,
} from "@/domain/note-document";

describe("structured note document", () => {
  it("fusionne les segments adjacents qui ont la même mise en forme", () => {
    expect(
      parseNoteDocument([
        {
          text: "Bonjour ",
          bold: true,
          italic: false,
          underline: false,
          size: "normal",
        },
        {
          text: "BrainBook",
          bold: true,
          italic: false,
          underline: false,
          size: "normal",
        },
      ]),
    ).toEqual([
      {
        text: "Bonjour BrainBook",
        bold: true,
        italic: false,
        underline: false,
        size: "normal",
      },
    ]);
  });

  it("refuse une structure ou une taille inconnue", () => {
    expect(parseNoteDocument([{ text: "<script>" }])).toBeNull();
    expect(
      parseNoteDocument([
        {
          text: "Texte",
          bold: false,
          italic: false,
          underline: false,
          size: "géant",
        },
      ]),
    ).toBeNull();
  });

  it("convertit les anciennes notes sans perdre passage ni réflexion", () => {
    const document = noteToDocument({
      formattedContent: null,
      extractedText: "Passage",
      personalReflection: "Réflexion",
    });
    expect(noteDocumentToPlainText(document)).toBe("Passage\n\nRéflexion");
  });

  it("ajoute une dictée au document existant", () => {
    expect(
      noteDocumentToPlainText(
        appendPlainTextToDocument(
          documentFromPlainText("Première idée."),
          "Deuxième idée.",
        ),
      ),
    ).toBe("Première idée. Deuxième idée.");
  });
});
