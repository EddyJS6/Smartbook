"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fallbackPageCorners,
  previewPointToNormalized,
  updatePageCorner,
  validatePageCorners,
  wholeImageCorners,
} from "@/domain/document-geometry";
import type {
  PageCornerName,
  PageCorners,
  PageDetectionResult,
  PhotographWarning,
} from "@/domain/document-types";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

const CORNERS: { name: PageCornerName; label: string; short: string }[] = [
  { name: "topLeft", label: "Coin haut gauche", short: "HG" },
  { name: "topRight", label: "Coin haut droit", short: "HD" },
  { name: "bottomRight", label: "Coin bas droit", short: "BD" },
  { name: "bottomLeft", label: "Coin bas gauche", short: "BG" },
];

type PageCornerEditorProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: PageCorners;
  detection: PageDetectionResult | null;
  isDetecting: boolean;
  error: string | null;
  warnings: PhotographWarning[];
  onCornersChange: (corners: PageCorners) => void;
  onAutomaticDetection: () => void;
  onRotate: (direction: "left" | "right") => void;
  onRetake: () => void;
  onRectify: () => void;
  onContinueWithoutRectifying: () => void;
};

function percent(value: number): string {
  return `${Math.min(100, Math.max(0, value * 100))}%`;
}

function polygonPoints(corners: PageCorners): string {
  return [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ]
    .map((point) => `${point.x * 100},${point.y * 100}`)
    .join(" ");
}

function dimPath(corners: PageCorners): string {
  const polygon = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ]
    .map((point) => `${point.x * 100} ${point.y * 100}`)
    .join(" L ");
  return `M 0 0 H 100 V 100 H 0 Z M ${polygon} Z`;
}

export function PageCornerEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  corners,
  detection,
  isDetecting,
  error,
  warnings,
  onCornersChange,
  onAutomaticDetection,
  onRotate,
  onRetake,
  onRectify,
  onContinueWithoutRectifying,
}: PageCornerEditorProps) {
  const [zoom, setZoom] = useState(1);
  const [activeCorner, setActiveCorner] =
    useState<PageCornerName>("topLeft");
  const [draggingCorner, setDraggingCorner] =
    useState<PageCornerName | null>(null);
  const [geometryMessage, setGeometryMessage] = useState<string | null>(null);
  const imageLayerRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const gestureStartRef = useRef<PageCorners | null>(null);
  const cornersRef = useRef(corners);
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{
    name: PageCornerName;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    cornersRef.current = corners;
  }, [corners]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      activePointerRef.current = null;
      gestureStartRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible" && gestureStartRef.current) {
        onCornersChange(gestureStartRef.current);
        activePointerRef.current = null;
        gestureStartRef.current = null;
        setDraggingCorner(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [onCornersChange]);

  const validation = useMemo(() => validatePageCorners(corners), [corners]);
  const activePoint = draggingCorner ? corners[draggingCorner] : null;

  const schedulePointUpdate = (
    name: PageCornerName,
    clientX: number,
    clientY: number,
  ) => {
    pendingPointRef.current = { name, x: clientX, y: clientY };
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPointRef.current;
      const layer = imageLayerRef.current;
      if (!pending || !layer) return;
      const rect = layer.getBoundingClientRect();
      const point = previewPointToNormalized(
        { x: pending.x, y: pending.y },
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      );
      onCornersChange(updatePageCorner(cornersRef.current, pending.name, point));
      setGeometryMessage(null);
    });
  };

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    name: PageCornerName,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    gestureStartRef.current = cornersRef.current;
    setActiveCorner(name);
    setDraggingCorner(name);
    schedulePointUpdate(name, event.clientX, event.clientY);
  };

  const moveDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    name: PageCornerName,
  ) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    schedulePointUpdate(name, event.clientX, event.clientY);
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const nextValidation = validatePageCorners(cornersRef.current);
    if (!nextValidation.valid && gestureStartRef.current) {
      onCornersChange(gestureStartRef.current);
      setGeometryMessage(
        nextValidation.errors[0] ??
          "Cette position rend le cadre impossible. Le coin a été restauré.",
      );
    }
    activePointerRef.current = null;
    gestureStartRef.current = null;
    setDraggingCorner(null);
  };

  const moveActiveCorner = (deltaX: number, deltaY: number) => {
    const point = corners[activeCorner];
    const next = updatePageCorner(corners, activeCorner, {
      x: point.x + deltaX,
      y: point.y + deltaY,
    });
    const nextValidation = validatePageCorners(next);
    if (nextValidation.valid) {
      onCornersChange(next);
      setGeometryMessage(null);
    } else {
      setGeometryMessage(nextValidation.errors[0]);
    }
  };

  return (
    <section aria-labelledby="page-adjustment-title" className="space-y-4">
      <div>
        <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
          Recadrage
        </p>
        <h2 id="page-adjustment-title" className="mt-1 text-xl font-semibold">
          Ajuster la page
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Placez chaque coin sur un angle de la page. La détection automatique
          reste une proposition à vérifier.
        </p>
      </div>

      {isDetecting ? (
        <div
          aria-live="polite"
          className="rounded-2xl bg-[var(--paper-deep)] p-3 text-sm text-[var(--muted)]"
        >
          Recherche approximative des bords de la page…
        </div>
      ) : detection?.warning ? (
        <StatusMessage
          tone={detection.status === "notDetected" ? "error" : "neutral"}
        >
          {detection.warning}
        </StatusMessage>
      ) : null}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {geometryMessage ? (
        <StatusMessage tone="error">{geometryMessage}</StatusMessage>
      ) : null}
      {warnings.map((warning) => (
        <StatusMessage key={warning.code} tone="neutral">
          {warning.message}
        </StatusMessage>
      ))}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">Zoom d’édition</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-pressed={zoom === 1}
            className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
          >
            Ajuster
          </button>
          <button
            type="button"
            aria-label="Réduire le zoom d’édition"
            disabled={zoom <= 1}
            onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
            className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-white disabled:opacity-40"
          >
            <Icon name="zoom-out" size={18} />
          </button>
          <button
            type="button"
            aria-label="Augmenter le zoom d’édition"
            disabled={zoom >= 2}
            onClick={() => setZoom((current) => Math.min(2, current + 0.5))}
            className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-white disabled:opacity-40"
          >
            <Icon name="zoom-in" size={18} />
          </button>
        </div>
      </div>

      <div className="max-h-[66dvh] overflow-auto rounded-2xl bg-[#252521] p-2">
        <div
          ref={imageLayerRef}
          className="relative select-none"
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: `${imageWidth} / ${imageHeight}`,
            touchAction: draggingCorner ? "none" : "pan-x pan-y",
          }}
        >
          {/* URL Blob locale et temporaire. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Page à recadrer"
            draggable={false}
            className="absolute inset-0 size-full object-contain"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <path
              d={dimPath(corners)}
              fill="rgb(0 0 0 / 0.48)"
              fillRule="evenodd"
            />
            <polygon
              points={polygonPoints(corners)}
              fill="transparent"
              stroke="#ffd778"
              strokeWidth="0.65"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {CORNERS.map(({ name, label, short }) => {
            const point = corners[name];
            return (
              <button
                key={name}
                type="button"
                aria-label={`Déplacer ${label.toLocaleLowerCase("fr")}`}
                onPointerDown={(event) => startDrag(event, name)}
                onPointerMove={(event) => moveDrag(event, name)}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onLostPointerCapture={() => {
                  if (draggingCorner === name) setDraggingCorner(null);
                }}
                className={`absolute z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full ${
                  draggingCorner === name
                    ? "bg-[#ffd778]/25"
                    : "bg-transparent"
                }`}
                style={{
                  left: `clamp(1.375rem, ${percent(point.x)}, calc(100% - 1.375rem))`,
                  top: `clamp(1.375rem, ${percent(point.y)}, calc(100% - 1.375rem))`,
                }}
              >
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-[var(--clay)] text-[0.5rem] font-bold text-white shadow-md">
                  {short}
                </span>
              </button>
            );
          })}

          {draggingCorner && activePoint ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-20 size-24 -translate-x-1/2 overflow-hidden rounded-full border-2 border-white bg-white shadow-xl"
              style={{
                left: percent(Math.min(0.82, Math.max(0.18, activePoint.x))),
                top:
                  activePoint.y < 0.5
                    ? percent(Math.min(0.82, activePoint.y + 0.18))
                    : undefined,
                bottom:
                  activePoint.y >= 0.5
                    ? percent(Math.min(0.82, 1 - activePoint.y + 0.08))
                    : undefined,
                backgroundImage: `url("${imageUrl}")`,
                backgroundSize: "420% 420%",
                backgroundPosition: `${activePoint.x * 100}% ${activePoint.y * 100}%`,
                backgroundRepeat: "no-repeat",
              }}
            >
              <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 bg-[var(--clay)]" />
              <span className="absolute top-1/2 left-1/2 h-6 w-px -translate-y-1/2 bg-[var(--clay)]" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onAutomaticDetection}
          disabled={isDetecting}
          className="min-h-12 rounded-2xl border border-[var(--line)] bg-white px-3 text-xs font-semibold disabled:opacity-50"
        >
          Détection automatique
        </button>
        <button
          type="button"
          onClick={() => onCornersChange(fallbackPageCorners())}
          className="min-h-12 rounded-2xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
        >
          Réinitialiser les coins
        </button>
        <button
          type="button"
          onClick={() => onRotate("left")}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
        >
          <Icon name="rotate-left" size={18} />
          Tourner à gauche
        </button>
        <button
          type="button"
          onClick={() => onRotate("right")}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
        >
          Tourner à droite
          <Icon name="rotate-right" size={18} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onCornersChange(wholeImageCorners())}
        className="min-h-11 w-full rounded-xl text-sm font-semibold text-[var(--moss)]"
      >
        Utiliser toute l’image
      </button>

      <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <summary className="min-h-8 cursor-pointer text-sm font-semibold">
          Réglage accessible des coins
        </summary>
        <div className="mt-4 space-y-3">
          <label htmlFor="active-page-corner" className="text-sm font-semibold">
            Coin à déplacer
          </label>
          <select
            id="active-page-corner"
            value={activeCorner}
            onChange={(event) =>
              setActiveCorner(event.target.value as PageCornerName)
            }
            className="min-h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-base"
          >
            {CORNERS.map((corner) => (
              <option key={corner.name} value={corner.name}>
                {corner.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <span />
            <button
              type="button"
              aria-label="Déplacer le coin vers le haut"
              onClick={() => moveActiveCorner(0, -0.005)}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white"
            >
              ↑
            </button>
            <span />
            <button
              type="button"
              aria-label="Déplacer le coin vers la gauche"
              onClick={() => moveActiveCorner(-0.005, 0)}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Déplacer le coin vers le bas par grand pas"
              onClick={() => moveActiveCorner(0, 0.025)}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white text-xs"
            >
              Grand pas
            </button>
            <button
              type="button"
              aria-label="Déplacer le coin vers la droite"
              onClick={() => moveActiveCorner(0.005, 0)}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white"
            >
              →
            </button>
            <span />
            <button
              type="button"
              aria-label="Déplacer le coin vers le bas"
              onClick={() => moveActiveCorner(0, 0.005)}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white"
            >
              ↓
            </button>
            <span />
          </div>
        </div>
      </details>

      {!validation.valid ? (
        <StatusMessage tone="error">
          {validation.errors[0]} Corrigez les coins avant de redresser la page.
        </StatusMessage>
      ) : null}

      <button
        type="button"
        disabled={!validation.valid}
        onClick={onRectify}
        className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        Redresser la page
      </button>
      <button
        type="button"
        onClick={onContinueWithoutRectifying}
        className="min-h-11 w-full text-sm font-semibold text-[var(--moss)]"
      >
        Continuer sans redresser
      </button>
      <button
        type="button"
        onClick={onRetake}
        className="min-h-11 w-full text-sm font-semibold text-[var(--clay)]"
      >
        Reprendre la photo
      </button>
    </section>
  );
}
