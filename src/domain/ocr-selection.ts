import type {
  OcrBoundingBox,
  OcrResult,
  OcrLine,
  OcrSelectionRange,
  OcrWord,
} from "@/domain/ocr-types";

export function normalizeSelectionRange(
  range: OcrSelectionRange | null,
): OcrSelectionRange | null {
  if (!range) return null;

  return {
    startOrder: Math.min(range.startOrder, range.endOrder),
    endOrder: Math.max(range.startOrder, range.endOrder),
  };
}

export function startSelection(order: number): OcrSelectionRange {
  return { startOrder: order, endOrder: order };
}

export function finishSelection(
  range: OcrSelectionRange | null,
  order: number,
): OcrSelectionRange {
  return {
    startOrder: range?.startOrder ?? order,
    endOrder: order,
  };
}

export function selectAllWords(
  words: readonly OcrWord[],
): OcrSelectionRange | null {
  if (words.length === 0) return null;
  return {
    startOrder: words[0].order,
    endOrder: words[words.length - 1].order,
  };
}

export function wordsInSelection(
  words: readonly OcrWord[],
  range: OcrSelectionRange | null,
): OcrWord[] {
  const normalized = normalizeSelectionRange(range);
  if (!normalized) return [];

  return words
    .filter(
      (word) =>
        word.order >= normalized.startOrder &&
        word.order <= normalized.endOrder,
    )
    .sort((left, right) => left.order - right.order);
}

const NO_SPACE_BEFORE = /^[,.;:!?%)\]»…’'-]/u;
const NO_SPACE_AFTER_PREVIOUS = /[(\['«’'-]$/u;

function joinWords(words: readonly OcrWord[]): string {
  let text = "";

  for (const word of words) {
    if (!text) {
      text = word.text;
      continue;
    }

    if (
      NO_SPACE_BEFORE.test(word.text) ||
      NO_SPACE_AFTER_PREVIOUS.test(text)
    ) {
      text += word.text;
    } else {
      text += ` ${word.text}`;
    }
  }

  return text;
}

export function reconstructSelectedText(
  result: OcrResult,
  range: OcrSelectionRange | null,
): string {
  const selected = wordsInSelection(result.words, range);
  if (selected.length === 0) return "";

  const groups: OcrWord[][] = [];
  for (const word of selected) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (
      !current ||
      !previous ||
      previous.blockIndex !== word.blockIndex ||
      previous.paragraphIndex !== word.paragraphIndex ||
      previous.lineIndex !== word.lineIndex
    ) {
      groups.push([word]);
    } else {
      current.push(word);
    }
  }

  return groups
    .map((group, index) => {
      if (index === 0) return joinWords(group);
      const previous = groups[index - 1][0];
      const current = group[0];
      const separator =
        previous.blockIndex !== current.blockIndex ||
        previous.paragraphIndex !== current.paragraphIndex
          ? "\n\n"
          : "\n";
      return `${separator}${joinWords(group)}`;
    })
    .join("")
    .trim();
}

export function scaleOcrBoundingBox(
  box: OcrBoundingBox,
  sourceWidth: number,
  sourceHeight: number,
  displayedWidth: number,
  displayedHeight: number,
): OcrBoundingBox {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    displayedWidth <= 0 ||
    displayedHeight <= 0
  ) {
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  }

  const scaleX = displayedWidth / sourceWidth;
  const scaleY = displayedHeight / sourceHeight;

  return {
    x0: box.x0 * scaleX,
    y0: box.y0 * scaleY,
    x1: box.x1 * scaleX,
    y1: box.y1 * scaleY,
  };
}

function distanceToBoxCenter(
  point: { x: number; y: number },
  box: OcrBoundingBox,
  verticalWeight: number,
): number {
  const centerX = (box.x0 + box.x1) / 2;
  const centerY = (box.y0 + box.y1) / 2;
  const dx =
    point.x < box.x0
      ? box.x0 - point.x
      : point.x > box.x1
        ? point.x - box.x1
        : Math.abs(point.x - centerX) * 0.08;
  const dy =
    point.y < box.y0
      ? box.y0 - point.y
      : point.y > box.y1
        ? point.y - box.y1
        : Math.abs(point.y - centerY) * 0.04;
  return Math.hypot(dx, dy * verticalWeight);
}

export function findNearestOcrWord(
  words: readonly OcrWord[],
  point: { x: number; y: number },
  maximumDistance: number,
): OcrWord | null {
  let nearest: OcrWord | null = null;
  let nearestDistance = maximumDistance;
  for (const word of words) {
    const distance = distanceToBoxCenter(point, word.bbox, 1.35);
    if (
      distance < nearestDistance ||
      (distance === nearestDistance &&
        nearest !== null &&
        word.order < nearest.order)
    ) {
      nearest = word;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function findNearestOcrLine(
  lines: readonly OcrLine[],
  point: { x: number; y: number },
  maximumDistance: number,
): OcrLine | null {
  let nearest: OcrLine | null = null;
  let nearestDistance = maximumDistance;
  for (const line of lines) {
    const distance = distanceToBoxCenter(point, line.bbox, 1.65);
    if (
      distance < nearestDistance ||
      (distance === nearestDistance &&
        nearest !== null &&
        line.order < nearest.order)
    ) {
      nearest = line;
      nearestDistance = distance;
    }
  }
  return nearest;
}
