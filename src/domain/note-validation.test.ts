import { describe, expect, it } from "vitest";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeTags,
  validateNote,
  validateTagCandidate,
} from "@/domain/note-validation";

describe("note validation", () => {
  it("accepte une note composée uniquement d’un passage", () => {
    const result = validateNote({
      extractedText: "  Une phrase importante.  ",
      personalReflection: "",
      pageNumber: "  chapitre 3  ",
      tags: [" Idée "],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "",
      formattedContent: null,
      extractedText: "Une phrase importante.",
      personalReflection: "",
      pageNumber: "chapitre 3",
      tags: ["Idée"],
    });
  });

  it("valide un contenu unique mis en forme et conserve sa structure", () => {
    const formattedContent = [
      {
        text: "Une idée importante",
        bold: true,
        italic: false,
        underline: true,
        size: "large" as const,
      },
    ];
    const result = validateNote({
      title: "À retenir",
      formattedContent,
      extractedText: "",
      personalReflection: "",
      pageNumber: "",
      tags: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.formattedContent).toEqual(formattedContent);
    expect(result.data.extractedText).toBe("Une idée importante");
    expect(result.data.personalReflection).toBe("");
  });

  it("accepte une note composée uniquement d’une réflexion", () => {
    const result = validateNote({
      extractedText: "",
      personalReflection: "  À tester demain.  ",
      pageNumber: "",
      tags: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.personalReflection).toBe("À tester demain.");
    expect(result.data.pageNumber).toBeNull();
  });

  it("refuse une note sans passage ni réflexion", () => {
    const result = validateNote({
      extractedText: " \n ",
      personalReflection: " ",
      pageNumber: "42",
      tags: ["Lecture"],
    });

    expect(result.success).toBe(false);
    expect(result.errors.content).toContain("au moins");
  });

  it("nettoie, déduplique sans tenir compte de la casse et limite les tags", () => {
    const tags = normalizeTags([
      "  Discipline  ",
      "discipline",
      ...Array.from({ length: MAX_TAGS + 3 }, (_, index) => `Tag ${index}`),
    ]);

    expect(tags[0]).toBe("Discipline");
    expect(tags).toHaveLength(MAX_TAGS);
    expect(
      tags.filter((tag) => tag.toLocaleLowerCase("fr") === "discipline"),
    ).toHaveLength(1);
  });

  it("signale un tag trop long", () => {
    expect(
      validateTagCandidate("x".repeat(MAX_TAG_LENGTH + 1), []),
    ).toContain(`${MAX_TAG_LENGTH}`);
  });
});
