import { describe, expect, it } from "vitest";
import { transformOcrPage } from "@/domain/ocr-transform";

const options = {
  imageWidth: 1200,
  imageHeight: 1800,
  language: "fra" as const,
};

describe("transformOcrPage", () => {
  it("gère un résultat vide", () => {
    expect(transformOcrPage(null, options)).toMatchObject({
      fullText: "",
      words: [],
      lines: [],
      meanConfidence: 0,
    });
  });

  it("transforme les blocs, lignes et mots dans un ordre stable", () => {
    const result = transformOcrPage(
      {
        text: "Bonjour monde\nDeuxième ligne",
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    text: "Bonjour monde",
                    bbox: { x0: 10, y0: 20, x1: 300, y1: 60 },
                    words: [
                      {
                        text: "Bonjour",
                        confidence: 92,
                        bbox: { x0: 10, y0: 20, x1: 130, y1: 60 },
                      },
                      { text: "  ", confidence: 5 },
                      {
                        text: "monde",
                        confidence: 81,
                        bbox: { x0: 150, y0: 20, x1: 300, y1: 60 },
                      },
                    ],
                  },
                  {
                    words: [
                      {
                        text: "Deuxième",
                        confidence: 72,
                        bbox: { x0: 10, y0: 80, x1: 150, y1: 120 },
                      },
                      {
                        text: "ligne",
                        confidence: 64,
                        bbox: { x0: 170, y0: 80, x1: 260, y1: 120 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      options,
    );

    expect(result.words.map((word) => word.text)).toEqual([
      "Bonjour",
      "monde",
      "Deuxième",
      "ligne",
    ]);
    expect(result.words.map((word) => word.order)).toEqual([0, 1, 2, 3]);
    expect(result.lines).toHaveLength(2);
    expect(result.words[1].bbox).toEqual({
      x0: 150,
      y0: 20,
      x1: 300,
      y1: 60,
    });
    expect(result.lines[1].text).toBe("Deuxième ligne");
  });

  it("conserve les relations entre plusieurs paragraphes", () => {
    const result = transformOcrPage(
      {
        blocks: [
          {
            paragraphs: [
              { lines: [{ words: [{ text: "Premier" }] }] },
              { lines: [{ words: [{ text: "Second" }] }] },
            ],
          },
        ],
      },
      options,
    );

    expect(result.words[0]).toMatchObject({ paragraphIndex: 0, order: 0 });
    expect(result.words[1]).toMatchObject({ paragraphIndex: 1, order: 1 });
  });

  it("préserve le texte brut lorsqu’aucune structure n’est disponible", () => {
    const result = transformOcrPage(
      { text: "Texte reconnu sans blocs", blocks: null, confidence: 43 },
      options,
    );

    expect(result.fullText).toBe("Texte reconnu sans blocs");
    expect(result.words).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.meanConfidence).toBe(43);
  });
});
