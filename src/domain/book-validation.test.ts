import { describe, expect, it } from "vitest";
import { validateBook } from "@/domain/book-validation";

describe("validateBook", () => {
  it("refuse un titre et un auteur vides", () => {
    const result = validateBook({
      title: "   ",
      author: "\n ",
      status: "to_read",
    });

    expect(result.success).toBe(false);
    expect(result.errors.title).toBe("Indiquez le titre du livre.");
    expect(result.errors.author).toBe("Indiquez le nom de l’auteur.");
  });

  it("normalise les espaces avant l’enregistrement", () => {
    const result = validateBook({
      title: "  Une   chambre à soi ",
      author: " Virginia   Woolf  ",
      status: "reading",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "Une chambre à soi",
      author: "Virginia Woolf",
      status: "reading",
    });
  });
});
