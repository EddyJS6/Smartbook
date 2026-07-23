import { describe, expect, it } from "vitest";
import type { OcrResult, OcrWord } from "@/domain/ocr-types";
import {
  finishSelection,
  normalizeSelectionRange,
  reconstructSelectedText,
  scaleOcrBoundingBox,
  selectAllWords,
  startSelection,
  wordsInSelection,
} from "@/domain/ocr-selection";

function word(
  order: number,
  text: string,
  lineIndex = 0,
  paragraphIndex = 0,
): OcrWord {
  return {
    id: `w${order}`,
    text,
    confidence: 90,
    bbox: { x0: order * 10, y0: 0, x1: order * 10 + 8, y1: 10 },
    blockIndex: 0,
    paragraphIndex,
    lineIndex,
    wordIndex: order,
    order,
  };
}

function result(words: OcrWord[]): OcrResult {
  return {
    fullText: words.map((item) => item.text).join(" "),
    words,
    lines: [],
    imageWidth: 100,
    imageHeight: 200,
    meanConfidence: 90,
    language: "fra",
  };
}

describe("OCR selection", () => {
  const words = [
    word(0, "Bonjour"),
    word(1, ","),
    word(2, "le"),
    word(3, "monde"),
    word(4, ".", 0),
    word(5, "l", 1),
    word(6, "'", 1),
    word(7, "histoire", 1),
    word(8, "bien", 2, 1),
    word(9, "-", 2, 1),
    word(10, "être", 2, 1),
  ];

  it("normalise les sélections dans les deux directions", () => {
    expect(normalizeSelectionRange({ startOrder: 8, endOrder: 2 })).toEqual({
      startOrder: 2,
      endOrder: 8,
    });
    expect(wordsInSelection(words, { startOrder: 3, endOrder: 1 })).toEqual([
      words[1],
      words[2],
      words[3],
    ]);
  });

  it("gère début, fin, tout sélectionner et effacer", () => {
    const started = startSelection(4);
    expect(started).toEqual({ startOrder: 4, endOrder: 4 });
    expect(finishSelection(started, 1)).toEqual({
      startOrder: 4,
      endOrder: 1,
    });
    expect(selectAllWords(words)).toEqual({
      startOrder: 0,
      endOrder: 10,
    });
    expect(selectAllWords([])).toBeNull();
    expect(wordsInSelection(words, null)).toEqual([]);
  });

  it("reconstruit un mot, une ligne et plusieurs lignes", () => {
    const ocrResult = result(words);
    expect(
      reconstructSelectedText(ocrResult, { startOrder: 3, endOrder: 3 }),
    ).toBe("monde");
    expect(
      reconstructSelectedText(ocrResult, { startOrder: 0, endOrder: 4 }),
    ).toBe("Bonjour, le monde.");
    expect(
      reconstructSelectedText(ocrResult, { startOrder: 0, endOrder: 7 }),
    ).toBe("Bonjour, le monde.\nl'histoire");
  });

  it("préserve paragraphes, apostrophes et traits d’union", () => {
    expect(
      reconstructSelectedText(result(words), {
        startOrder: 5,
        endOrder: 10,
      }),
    ).toBe("l'histoire\n\nbien-être");
  });

  it("retourne une chaîne vide pour une sélection vide", () => {
    expect(reconstructSelectedText(result(words), null)).toBe("");
  });

  it("met une boîte à l’échelle indépendamment sur les deux axes", () => {
    expect(
      scaleOcrBoundingBox(
        { x0: 10, y0: 20, x1: 30, y1: 60 },
        100,
        200,
        200,
        300,
      ),
    ).toEqual({ x0: 20, y0: 30, x1: 60, y1: 90 });
  });
});
