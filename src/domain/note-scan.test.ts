import { describe, expect, it } from "vitest";
import { applyScannedPassage } from "@/domain/note-scan";

describe("scan integration with the note draft", () => {
  it("transfère le passage corrigé et marque la provenance scan", () => {
    const result = applyScannedPassage(
      {
        values: {
          extractedText: "Ancien passage",
          personalReflection: "Ma réflexion",
          pageNumber: "42",
          tags: ["Mémoire", "Action"],
        },
        sourceType: "manual",
      },
      "  Passage corrigé après OCR.  ",
    );

    expect(result).toEqual({
      values: {
        extractedText: "Passage corrigé après OCR.",
        personalReflection: "Ma réflexion",
        pageNumber: "42",
        tags: ["Mémoire", "Action"],
      },
      sourceType: "scan",
    });
  });

  it("remplace uniquement le passage lors d’un nouveau scan", () => {
    const result = applyScannedPassage(
      {
        values: {
          extractedText: "Premier scan",
          personalReflection: "Réflexion conservée",
          pageNumber: "",
          tags: ["Lecture"],
        },
        sourceType: "scan",
      },
      "Second scan",
    );

    expect(result.values.personalReflection).toBe("Réflexion conservée");
    expect(result.values.tags).toEqual(["Lecture"]);
    expect(result.values.extractedText).toBe("Second scan");
  });
});
