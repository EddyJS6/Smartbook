"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OcrResult, OcrSelectionRange } from "@/domain/ocr-types";
import {
  findNearestOcrLine,
  findNearestOcrWord,
  finishSelection,
  normalizeSelectionRange,
  reconstructSelectedText,
  selectAllWords,
  startSelection,
  wordsInSelection,
} from "@/domain/ocr-selection";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

type SelectionView = "image" | "lines" | "text";

type OcrWordSelectorProps = {
  imageUrl: string;
  result: OcrResult;
  onPassageSelected: (text: string) => void;
  onRestart: () => void;
};

function boxPercent(value: number, total: number): string {
  const percentage = total > 0 ? value / total * 100 : 0;
  return `${Math.max(0, Math.min(100, percentage))}%`;
}

export function OcrWordSelector({
  imageUrl,
  result,
  onPassageSelected,
  onRestart,
}: OcrWordSelectorProps) {
  const [view, setView] = useState<SelectionView>(
    result.words.length > 0 ? "image" : "text",
  );
  const [selection, setSelection] = useState<OcrSelectionRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [editableText, setEditableText] = useState(result.fullText);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const wordOverlayRef = useRef<HTMLDivElement>(null);
  const tapAnchorRef = useRef<number | null>(null);
  const lineAnchorRef = useRef<number | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const lastOrderRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const completingTapRef = useRef(false);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerPointRef = useRef({ x: 0, y: 0 });

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
      }
    },
    [],
  );

  const selectedWords = useMemo(
    () => wordsInSelection(result.words, selection),
    [result.words, selection],
  );
  const passage = useMemo(
    () => reconstructSelectedText(result, selection),
    [result, selection],
  );
  const normalizedRange = normalizeSelectionRange(selection);

  const nearestWordOrder = (
    clientX: number,
    clientY: number,
    exactTarget?: EventTarget | null,
  ): number | null => {
    const target =
      exactTarget instanceof HTMLElement
        ? exactTarget.closest<HTMLElement>("[data-ocr-order]")
        : null;
    const exactOrder = Number(target?.dataset.ocrOrder);
    if (Number.isFinite(exactOrder)) return exactOrder;

    const overlay = wordOverlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const nearest = findNearestOcrWord(
      result.words,
      {
        x:
          (clientX - rect.left) /
          Math.max(rect.width, 1) *
          result.imageWidth,
        y:
          (clientY - rect.top) /
          Math.max(rect.height, 1) *
          result.imageHeight,
      },
      Math.max(result.imageWidth, result.imageHeight) * 0.035,
    );
    return nearest?.order ?? null;
  };

  const updateSelectionEnd = (order: number) => {
    if (order === lastOrderRef.current || dragStartRef.current === null) return;
    lastOrderRef.current = order;
    movedRef.current = true;
    setSelection({
      startOrder: dragStartRef.current,
      endOrder: order,
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const order = nearestWordOrder(
      event.clientX,
      event.clientY,
      event.target,
    );
    if (order === null) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    movedRef.current = false;
    lastOrderRef.current = order;
    completingTapRef.current = tapAnchorRef.current !== null;
    dragStartRef.current = tapAnchorRef.current ?? order;
    setSelection(
      tapAnchorRef.current === null
        ? startSelection(order)
        : finishSelection(startSelection(tapAnchorRef.current), order),
    );
    setSelectionError(null);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    event.preventDefault();
    pointerPointRef.current = { x: event.clientX, y: event.clientY };
    if (pointerFrameRef.current !== null) return;

    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const { x, y } = pointerPointRef.current;
      const target = document.elementFromPoint(x, y);
      const order = nearestWordOrder(x, y, target);
      if (order !== null) updateSelectionEnd(order);
    });
  };

  const endPointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (movedRef.current || completingTapRef.current) {
      tapAnchorRef.current = null;
    } else {
      tapAnchorRef.current = lastOrderRef.current;
    }
    dragStartRef.current = null;
    completingTapRef.current = false;
  };

  const selectNearestLine = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const line = findNearestOcrLine(
      result.lines,
      {
        x:
          (event.clientX - rect.left) /
          Math.max(rect.width, 1) *
          result.imageWidth,
        y:
          (event.clientY - rect.top) /
          Math.max(rect.height, 1) *
          result.imageHeight,
      },
      Math.max(result.imageWidth, result.imageHeight) * 0.05,
    );
    const first = line?.words[0];
    const last = line?.words.at(-1);
    if (!first || !last) return;

    const anchor = lineAnchorRef.current;
    if (anchor === null) {
      lineAnchorRef.current = first.order;
      setSelection({ startOrder: first.order, endOrder: last.order });
    } else {
      setSelection({
        startOrder: anchor,
        endOrder: first.order < anchor ? first.order : last.order,
      });
      lineAnchorRef.current = null;
    }
    setSelectionError(null);
  };

  const clearSelection = () => {
    setSelection(null);
    tapAnchorRef.current = null;
    lineAnchorRef.current = null;
    dragStartRef.current = null;
    setSelectionError(null);
  };

  const useImageSelection = () => {
    if (!passage.trim()) {
      setSelectionError("Sélectionnez au moins un mot avant de continuer.");
      return;
    }
    onPassageSelected(passage);
  };

  const useNativeTextSelection = () => {
    const area = textAreaRef.current;
    if (!area || area.selectionStart === area.selectionEnd) {
      setSelectionError(
        "Sélectionnez une portion du texte avant de continuer.",
      );
      return;
    }
    const selected = editableText.slice(area.selectionStart, area.selectionEnd);
    if (!selected.trim()) {
      setSelectionError("La sélection ne contient aucun texte.");
      return;
    }
    onPassageSelected(selected);
  };

  const useAllEditableText = () => {
    if (!editableText.trim()) {
      setSelectionError("Le texte reconnu est vide.");
      return;
    }
    onPassageSelected(editableText);
  };

  return (
    <section aria-labelledby="ocr-selection-title" className="space-y-4">
      <div>
        <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
          Texte reconnu
        </p>
        <h2 id="ocr-selection-title" className="mt-1 text-xl font-semibold">
          Sélectionnez votre passage
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Choisissez les mots, des lignes entières, ou la sélection textuelle
          accessible.
        </p>
      </div>

      {result.meanConfidence < 65 ? (
        <StatusMessage tone="error">
          Certains mots semblent difficiles à reconnaître. Vérifiez le passage
          avant de l’enregistrer.
        </StatusMessage>
      ) : null}

      {result.words.length === 0 ? (
        <StatusMessage tone="error">
          Les boîtes de mots ne sont pas disponibles. Utilisez la sélection
          textuelle accessible ci-dessous.
        </StatusMessage>
      ) : null}

      <div
        role="tablist"
        aria-label="Méthode de sélection"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--paper-deep)] p-1"
      >
        {[
          { value: "image" as const, label: "Mots", disabled: !result.words.length },
          { value: "lines" as const, label: "Lignes", disabled: !result.lines.length },
          { value: "text" as const, label: "Texte", disabled: false },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={view === tab.value}
            disabled={tab.disabled}
            onClick={() => setView(tab.value)}
            className={`min-h-11 rounded-xl px-2 text-xs font-semibold ${
              view === tab.value
                ? "bg-white text-[var(--moss)] shadow-sm"
                : "text-[var(--muted)]"
            } disabled:opacity-40`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view !== "text" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            {selectedWords.length}{" "}
            {selectedWords.length > 1 ? "mots sélectionnés" : "mot sélectionné"}
          </p>
          <div className="flex items-center gap-2" aria-label="Zoom de la page">
            <button
              type="button"
              aria-label="Réduire le zoom"
              disabled={zoom <= 1}
              onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
              className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-white disabled:opacity-40"
            >
              <Icon name="zoom-out" size={19} />
            </button>
            <span className="w-11 text-center text-xs font-semibold">
              {Math.round(zoom * 100)} %
            </span>
            <button
              type="button"
              aria-label="Augmenter le zoom"
              disabled={zoom >= 2}
              onClick={() => setZoom((current) => Math.min(2, current + 0.5))}
              className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-white disabled:opacity-40"
            >
              <Icon name="zoom-in" size={19} />
            </button>
          </div>
        </div>
      ) : null}

      {view === "image" && result.words.length > 0 ? (
        <>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Glissez du premier au dernier mot, ou touchez successivement les
            deux extrémités. Un toucher proche du texte choisit le mot le plus
            proche.
          </p>
          <div className="max-h-[68dvh] overflow-auto rounded-2xl bg-[#272722] p-2">
            <div
              className="relative"
              style={{
                width: `${zoom * 100}%`,
                aspectRatio: `${result.imageWidth} / ${result.imageHeight}`,
              }}
            >
              {/* URL Blob locale, jamais une ressource distante. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Page analysée avec passage sélectionnable"
                draggable={false}
                className="absolute inset-0 size-full select-none object-contain"
              />
              <div
                ref={wordOverlayRef}
                aria-hidden="true"
                className="absolute inset-0 select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerGesture}
                onPointerCancel={endPointerGesture}
              >
                {result.words.map((word) => {
                  const selected =
                    normalizedRange !== null &&
                    word.order >= normalizedRange.startOrder &&
                    word.order <= normalizedRange.endOrder;
                  const lowConfidence = word.confidence < 60;
                  return (
                    <span
                      key={word.id}
                      data-ocr-order={word.order}
                      className={`absolute block rounded-[2px] border ${
                        selected
                          ? "border-[#f6b951] bg-[#ffd778]/65"
                          : lowConfidence
                            ? "border-dashed border-[#dc7558]/70 bg-[#dc7558]/10"
                            : "border-white/15 bg-transparent"
                      }`}
                      style={{
                        left: boxPercent(word.bbox.x0, result.imageWidth),
                        top: boxPercent(word.bbox.y0, result.imageHeight),
                        width: boxPercent(
                          word.bbox.x1 - word.bbox.x0,
                          result.imageWidth,
                        ),
                        height: boxPercent(
                          word.bbox.y1 - word.bbox.y0,
                          result.imageHeight,
                        ),
                        touchAction: "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {view === "lines" && result.lines.length > 0 ? (
        <>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Touchez une ligne, puis une autre pour prendre le passage compris
            entre les deux. Ce mode est plus tolérant près d’une reliure.
          </p>
          <div className="max-h-[68dvh] overflow-auto rounded-2xl bg-[#272722] p-2">
            <div
              className="relative"
              style={{
                width: `${zoom * 100}%`,
                aspectRatio: `${result.imageWidth} / ${result.imageHeight}`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Page analysée avec lignes sélectionnables"
                draggable={false}
                className="absolute inset-0 size-full select-none object-contain"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 touch-none select-none"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  selectNearestLine(event);
                }}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
              >
                {result.lines.map((line) => {
                  const first = line.words[0];
                  const last = line.words.at(-1);
                  const selected =
                    first &&
                    last &&
                    normalizedRange !== null &&
                    last.order >= normalizedRange.startOrder &&
                    first.order <= normalizedRange.endOrder;
                  return (
                    <span
                      key={line.id}
                      className={`absolute block rounded border ${
                        selected
                          ? "border-[#f6b951] bg-[#ffd778]/55"
                          : "border-white/20 bg-white/5"
                      }`}
                      style={{
                        left: boxPercent(line.bbox.x0, result.imageWidth),
                        top: boxPercent(line.bbox.y0, result.imageHeight),
                        width: boxPercent(
                          line.bbox.x1 - line.bbox.x0,
                          result.imageWidth,
                        ),
                        height: boxPercent(
                          line.bbox.y1 - line.bbox.y0,
                          result.imageHeight,
                        ),
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {view !== "text" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelection(selectAllWords(result.words))}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--clay)]"
            >
              Effacer la sélection
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--muted)]"
            >
              Recommencer
            </button>
          </div>
          {passage ? (
            <div className="rounded-2xl bg-[var(--paper-deep)] p-4">
              <p className="text-xs font-semibold text-[var(--moss)]">
                Aperçu du passage
              </p>
              <p className="mt-2 line-clamp-5 whitespace-pre-wrap font-serif text-sm leading-6">
                {passage}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={useImageSelection}
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            Utiliser ce passage
          </button>
        </>
      ) : null}

      {view === "text" ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[var(--muted)]">
            Corrigez le texte si nécessaire, puis utilisez la sélection native
            ou l’intégralité. Cette vue est recommandée pour une page très
            incurvée ou lorsque les surlignages sont mal alignés.
          </p>
          <textarea
            id="ocr-editable-text"
            ref={textAreaRef}
            value={editableText}
            onChange={(event) => {
              setEditableText(event.target.value);
              setSelectionError(null);
            }}
            rows={14}
            className="w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-4 text-base leading-7"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={useNativeTextSelection}
              className="min-h-12 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
            >
              Utiliser la sélection
            </button>
            <button
              type="button"
              onClick={useAllEditableText}
              className="min-h-12 rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
            >
              Utiliser tout le texte
            </button>
          </div>
          <button
            type="button"
            onClick={() => setView(result.words.length ? "image" : "text")}
            className="min-h-11 w-full text-sm font-semibold text-[var(--moss)]"
          >
            Retour vers l’image
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="min-h-11 w-full text-sm font-semibold text-[var(--muted)]"
          >
            Recommencer l’analyse
          </button>
        </div>
      ) : null}

      {selectionError ? (
        <StatusMessage tone="error">{selectionError}</StatusMessage>
      ) : null}
    </section>
  );
}
