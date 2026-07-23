import type {
  OcrBoundingBox,
  OcrLanguage,
  OcrLine,
  OcrResult,
  OcrWord,
} from "@/domain/ocr-types";

export interface RawOcrWord {
  text?: string | null;
  confidence?: number | null;
  bbox?: Partial<OcrBoundingBox> | null;
}

export interface RawOcrLine {
  words?: RawOcrWord[] | null;
  text?: string | null;
  bbox?: Partial<OcrBoundingBox> | null;
}

export interface RawOcrParagraph {
  lines?: RawOcrLine[] | null;
}

export interface RawOcrBlock {
  paragraphs?: RawOcrParagraph[] | null;
}

export interface RawOcrPage {
  blocks?: RawOcrBlock[] | null;
  text?: string | null;
  confidence?: number | null;
}

type TransformOptions = {
  imageWidth: number;
  imageHeight: number;
  language: OcrLanguage;
  processingDurationMs?: number;
};

const EMPTY_BOX: OcrBoundingBox = { x0: 0, y0: 0, x1: 0, y1: 0 };

function finiteCoordinate(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function normalizeBox(
  box: Partial<OcrBoundingBox> | null | undefined,
): OcrBoundingBox {
  if (!box) return { ...EMPTY_BOX };

  const x0 = finiteCoordinate(box.x0);
  const y0 = finiteCoordinate(box.y0);
  const x1 = Math.max(x0, finiteCoordinate(box.x1));
  const y1 = Math.max(y0, finiteCoordinate(box.y1));
  return { x0, y0, x1, y1 };
}

function boxFromWords(words: readonly OcrWord[]): OcrBoundingBox {
  if (words.length === 0) return { ...EMPTY_BOX };

  return words.reduce<OcrBoundingBox>(
    (box, word) => ({
      x0: Math.min(box.x0, word.bbox.x0),
      y0: Math.min(box.y0, word.bbox.y0),
      x1: Math.max(box.x1, word.bbox.x1),
      y1: Math.max(box.y1, word.bbox.y1),
    }),
    { ...words[0].bbox },
  );
}

function hasUsableBox(box: OcrBoundingBox): boolean {
  return box.x1 > box.x0 && box.y1 > box.y0;
}

export function transformOcrPage(
  page: RawOcrPage | null | undefined,
  options: TransformOptions,
): OcrResult {
  const words: OcrWord[] = [];
  const lines: OcrLine[] = [];
  let order = 0;

  for (const [blockIndex, block] of (page?.blocks ?? []).entries()) {
    for (const [paragraphIndex, paragraph] of (
      block.paragraphs ?? []
    ).entries()) {
      for (const [lineIndex, rawLine] of (paragraph.lines ?? []).entries()) {
        const lineWords: OcrWord[] = [];

        for (const [wordIndex, rawWord] of (
          rawLine.words ?? []
        ).entries()) {
          const text = rawWord.text?.trim() ?? "";
          if (!text) continue;

          const word: OcrWord = {
            id: `b${blockIndex}-p${paragraphIndex}-l${lineIndex}-w${wordIndex}`,
            text,
            confidence: Number.isFinite(rawWord.confidence)
              ? Number(rawWord.confidence)
              : 0,
            bbox: normalizeBox(rawWord.bbox),
            blockIndex,
            paragraphIndex,
            lineIndex,
            wordIndex,
            order,
          };
          order += 1;
          words.push(word);
          lineWords.push(word);
        }

        if (lineWords.length === 0) continue;

        const rawBox = normalizeBox(rawLine.bbox);
        lines.push({
          id: `b${blockIndex}-p${paragraphIndex}-l${lineIndex}`,
          words: lineWords,
          text:
            rawLine.text?.trim() ??
            lineWords.map((word) => word.text).join(" "),
          bbox: hasUsableBox(rawBox) ? rawBox : boxFromWords(lineWords),
          blockIndex,
          paragraphIndex,
          lineIndex,
          order: lines.length,
        });
      }
    }
  }

  const structuredText = lines.map((line) => line.text).join("\n").trim();
  const fullText = page?.text?.trim() || structuredText;
  const meanConfidence =
    words.length > 0
      ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
      : Number.isFinite(page?.confidence)
        ? Number(page?.confidence)
        : 0;

  return {
    fullText,
    words,
    lines,
    imageWidth: Math.max(0, options.imageWidth),
    imageHeight: Math.max(0, options.imageHeight),
    meanConfidence,
    language: options.language,
    ...(options.processingDurationMs === undefined
      ? {}
      : { processingDurationMs: options.processingDurationMs }),
  };
}
