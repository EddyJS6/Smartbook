"use client";

import { useEffect, useRef, useState } from "react";
import { useTemporaryObjectUrl } from "@/hooks/use-temporary-object-url";
import {
  OcrImageError,
  prepareOcrImage,
  type PreparedOcrImage,
} from "@/lib/ocr-image-processing";
import {
  AiRecognitionError,
  recognizePageWithAi,
  type AiRecognitionResult,
} from "@/services/ai-recognition-service";
import { AiTextSelector } from "@/components/notes/ai-text-selector";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

type ScanFlowProps = {
  file: File;
  onPassageReady: (passage: string) => void;
};

type QuickScanStage = "preview" | "processing" | "selection";

function reportScanError(error: unknown): string {
  if (process.env.NODE_ENV === "development") {
    console.error("Échec du parcours scanner", error);
  }
  if (error instanceof OcrImageError || error instanceof AiRecognitionError) {
    return error.message;
  }
  return "Une erreur inattendue a interrompu le scan. Votre photo est conservée : vous pouvez réessayer.";
}

export function ScanFlow({ file, onPassageReady }: ScanFlowProps) {
  const [stage, setStage] = useState<QuickScanStage>("preview");
  const [preparedImage, setPreparedImage] =
    useState<PreparedOcrImage | null>(null);
  const [result, setResult] = useState<AiRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const recognitionIdRef = useRef(0);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const photoUrl = useTemporaryObjectUrl(file);
  const preparedUrl = useTemporaryObjectUrl(preparedImage?.blob ?? null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionIdRef.current += 1;
      recognitionAbortRef.current?.abort();
      recognitionAbortRef.current = null;
    };
  }, []);

  const sendPhoto = async () => {
    const recognitionId = ++recognitionIdRef.current;
    recognitionAbortRef.current?.abort();
    const controller = new AbortController();
    recognitionAbortRef.current = controller;
    setError(null);
    setResult(null);
    setStage("processing");

    try {
      const prepared = await prepareOcrImage(file, 0, "original");
      if (
        !mountedRef.current ||
        recognitionId !== recognitionIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      setPreparedImage(prepared);
      const nextResult = await recognizePageWithAi(
        prepared.blob,
        "fra",
        controller.signal,
      );
      if (
        !mountedRef.current ||
        recognitionId !== recognitionIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      if (!nextResult.text.trim()) {
        setError("Aucun texte n’a pu être détecté sur cette photo.");
        setStage("preview");
        return;
      }

      setResult(nextResult);
      setStage("selection");
    } catch (failure) {
      if (
        !mountedRef.current ||
        recognitionId !== recognitionIdRef.current ||
        (failure instanceof AiRecognitionError &&
          failure.code === "cancelled")
      ) {
        return;
      }
      setError(reportScanError(failure));
      setStage("preview");
    } finally {
      if (recognitionAbortRef.current === controller) {
        recognitionAbortRef.current = null;
      }
    }
  };

  const restartRecognition = () => {
    recognitionIdRef.current += 1;
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    setPreparedImage(null);
    setResult(null);
    setError(null);
    setStage("preview");
  };

  return (
    <section className="mt-4 space-y-5" aria-label="Scanner une page">
      {stage === "preview" && photoUrl ? (
        <section className="space-y-4" aria-labelledby="quick-scan-title">
          <div>
            <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
              Scan rapide
            </p>
            <h2 id="quick-scan-title" className="mt-1 text-xl font-semibold">
              Votre photo est prête
            </h2>
          </div>

          <div className="overflow-hidden rounded-3xl bg-[#292925] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Page à envoyer à la reconnaissance IA"
              className="max-h-[50dvh] w-full rounded-2xl object-contain"
            />
          </div>

          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

          <p className="flex gap-2 rounded-2xl bg-[var(--paper-deep)] p-4 text-xs leading-5 text-[var(--muted)]">
            <span className="mt-0.5 shrink-0">
              <Icon name="shield" size={17} />
            </span>
            <span>
              La photo sera envoyée temporairement à OpenAI uniquement après
              votre appui sur Envoyer. Elle ne sera pas enregistrée dans
              BrainBook.
            </span>
          </p>

          <button
            type="button"
            onClick={() => void sendPhoto()}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3.5 text-base font-semibold text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)]"
          >
            <Icon name="spark" size={19} />
            Envoyer
          </button>
        </section>
      ) : null}

      {stage === "processing" ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <p className="font-semibold">Reconnaissance IA en cours</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            La photo est optimisée puis convertie en texte. Cela peut prendre
            quelques secondes.
          </p>
          <div
            role="progressbar"
            aria-label="Reconnaissance IA en cours"
            className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--moss)]" />
          </div>
        </div>
      ) : null}

      {stage === "selection" && result && (preparedUrl || photoUrl) ? (
        <AiTextSelector
          imageUrl={preparedUrl ?? photoUrl ?? ""}
          initialText={result.text}
          onPassageSelected={onPassageReady}
          onRestart={restartRecognition}
        />
      ) : null}
    </section>
  );
}
