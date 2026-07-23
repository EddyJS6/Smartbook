"use client";

import { useEffect, useRef, useState } from "react";
import type {
  OcrImageMode,
  OcrLanguage,
  OcrProgress,
  OcrResult,
  ScanStage,
} from "@/domain/ocr-types";
import { OCR_LANGUAGES } from "@/domain/ocr-types";
import { normalizeMultilineText } from "@/domain/note-validation";
import { useTemporaryObjectUrl } from "@/hooks/use-temporary-object-url";
import {
  OcrImageError,
  prepareOcrImage,
  type PreparedOcrImage,
} from "@/lib/ocr-image-processing";
import {
  BrowserOcrSession,
  OcrServiceError,
  isOcrLanguagePrepared,
} from "@/services/ocr-service";
import { OcrWordSelector } from "@/components/notes/ocr-word-selector";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

type ScanFlowProps = {
  onPassageReady: (passage: string) => void;
  onExitToManual: () => void;
};

const languageLabels = Object.fromEntries(
  OCR_LANGUAGES.map((language) => [language.code, language.label]),
) as Record<OcrLanguage, string>;

function reportScanError(error: unknown): string {
  if (process.env.NODE_ENV === "development") {
    console.error("Échec du parcours OCR", error);
  }
  if (error instanceof OcrImageError || error instanceof OcrServiceError) {
    return error.message;
  }
  return "Une erreur inattendue a interrompu le scan. Votre photo est conservée : vous pouvez réessayer.";
}

export function ScanFlow({
  onPassageReady,
  onExitToManual,
}: ScanFlowProps) {
  const [stage, setStage] = useState<ScanStage>("idle");
  const [preparedImage, setPreparedImage] =
    useState<PreparedOcrImage | null>(null);
  const [rotation, setRotation] = useState(0);
  const [imageMode, setImageMode] = useState<OcrImageMode>("original");
  const [language, setLanguage] = useState<OcrLanguage>("fra");
  const [languagePrepared, setLanguagePrepared] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const fileRef = useRef<File | null>(null);
  const sessionRef = useRef<BrowserOcrSession | null>(null);
  const mountedRef = useRef(true);
  const preparationIdRef = useRef(0);
  const recognitionIdRef = useRef(0);
  const previewUrl = useTemporaryObjectUrl(preparedImage?.blob ?? null);

  useEffect(() => {
    void isOcrLanguagePrepared(language)
      .then((prepared) => {
        if (mountedRef.current) setLanguagePrepared(prepared);
      })
      .catch(() => {
        if (mountedRef.current) setLanguagePrepared(false);
      });
  }, [language]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      preparationIdRef.current += 1;
      recognitionIdRef.current += 1;
      fileRef.current = null;
      void sessionRef.current?.terminate();
      sessionRef.current = null;
    };
  }, []);

  const getSession = () => {
    if (!sessionRef.current) {
      sessionRef.current = new BrowserOcrSession((nextProgress) => {
        if (!mountedRef.current) return;
        setProgress(nextProgress);
        if (nextProgress.phase === "recognition") {
          setStage("recognizing");
        } else if (
          nextProgress.phase === "engine" ||
          nextProgress.phase === "language"
        ) {
          setStage("loadingOcrEngine");
        }
      });
    }
    return sessionRef.current;
  };

  const prepareSelectedImage = async (
    nextRotation: number,
    nextMode: OcrImageMode,
  ): Promise<PreparedOcrImage | null> => {
    const file = fileRef.current;
    if (!file) {
      setError("Aucune image n’a été choisie.");
      setStage("error");
      return null;
    }

    const preparationId = ++preparationIdRef.current;
    setStage("preparingImage");
    setError(null);

    try {
      const prepared = await prepareOcrImage(file, nextRotation, nextMode);
      if (
        !mountedRef.current ||
        preparationId !== preparationIdRef.current
      ) {
        return null;
      }
      setPreparedImage(prepared);
      setRotation(prepared.rotation);
      setImageMode(prepared.mode);
      setResult(null);
      setSettingsChanged(false);
      setStage("readyForOcr");
      return prepared;
    } catch (failure) {
      if (
        !mountedRef.current ||
        preparationId !== preparationIdRef.current
      ) {
        return null;
      }
      setError(reportScanError(failure));
      setStage("error");
      return null;
    }
  };

  const handleFileSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      setError(
        "Aucune image n’a été choisie. Vous pouvez reprendre une photo ou ouvrir la photothèque.",
      );
      return;
    }

    fileRef.current = file;
    setPreparedImage(null);
    setResult(null);
    setReviewText("");
    setRotation(0);
    await prepareSelectedImage(0, imageMode);
  };

  const runRecognition = async (
    image = preparedImage,
  ): Promise<void> => {
    if (!image) {
      setError("Préparez une image avant de lancer la reconnaissance.");
      setStage("error");
      return;
    }

    const recognitionId = ++recognitionIdRef.current;
    setError(null);
    setProgress({
      phase: "engine",
      label: "Chargement du moteur de reconnaissance",
      progress: null,
    });
    setStage("loadingOcrEngine");

    try {
      const nextResult = await getSession().recognize(
        image.blob,
        language,
        { width: image.width, height: image.height },
      );
      if (
        !mountedRef.current ||
        recognitionId !== recognitionIdRef.current
      ) {
        return;
      }
      if (!nextResult.fullText.trim()) {
        setError("Aucun texte n’a pu être détecté sur cette image.");
        setStage("error");
        return;
      }

      setResult(nextResult);
      setLanguagePrepared(true);
      setSettingsChanged(false);
      setStage("selection");
    } catch (failure) {
      if (
        !mountedRef.current ||
        recognitionId !== recognitionIdRef.current
      ) {
        return;
      }
      if (
        failure instanceof OcrServiceError &&
        failure.code === "cancelled"
      ) {
        return;
      }
      setError(reportScanError(failure));
      setStage("error");
    }
  };

  const cancelRecognition = async () => {
    recognitionIdRef.current += 1;
    setProgress(null);
    await sessionRef.current?.cancel();
    if (mountedRef.current) setStage("readyForOcr");
  };

  const restartFromSelection = () => {
    setResult(null);
    setReviewText("");
    setReviewError(null);
    setSettingsChanged(false);
    setStage("readyForOcr");
  };

  const reanalyzeWithSettings = async () => {
    const prepared = await prepareSelectedImage(rotation, imageMode);
    if (prepared) await runRecognition(prepared);
  };

  const openReview = (passage: string) => {
    setReviewText(passage);
    setReviewError(null);
    setStage("review");
  };

  const addPassageToNote = () => {
    const normalized = normalizeMultilineText(reviewText);
    if (!normalized) {
      setReviewError("Le passage ne peut pas être vide.");
      return;
    }
    onPassageReady(normalized);
  };

  const resetPhoto = () => {
    preparationIdRef.current += 1;
    recognitionIdRef.current += 1;
    fileRef.current = null;
    setPreparedImage(null);
    setResult(null);
    setReviewText("");
    setError(null);
    setProgress(null);
    setSettingsChanged(false);
    setStage("idle");
    void sessionRef.current?.terminate();
    sessionRef.current = null;
  };

  const isProcessing =
    stage === "preparingImage" ||
    stage === "loadingOcrEngine" ||
    stage === "recognizing";

  return (
    <section className="mt-6 space-y-5" aria-label="Scanner une page">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
            <Icon name="shield" size={19} />
          </span>
          <p className="text-xs leading-5 text-[var(--muted)]">
            La reconnaissance est effectuée sur cet appareil. La photo de la
            page n’est pas envoyée à un serveur.
          </p>
        </div>
      </div>

      {stage === "idle" || (stage === "error" && !preparedImage) ? (
        <div className="space-y-5">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
            <h2 className="font-semibold">Photographiez une seule page</h2>
            <ul className="mt-3 space-y-1.5 text-sm leading-5 text-[var(--muted)]">
              <li>• Gardez le téléphone parallèle à la page.</li>
              <li>• Utilisez une lumière suffisante et évitez les ombres.</li>
              <li>• Ne coupez pas les lignes de texte.</li>
            </ul>
          </div>

          <div className="grid gap-3">
            <label
              htmlFor="scan-camera-image"
              className="flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
            >
              <Icon name="camera" size={20} />
              Photographier une page
            </label>
            <input
              id="scan-camera-image"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void handleFileSelection(event)}
              className="sr-only"
            />
            <label
              htmlFor="scan-library-image"
              className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--moss)] bg-white px-5 py-3 text-sm font-semibold text-[var(--moss)]"
            >
              <Icon name="image" size={19} />
              Choisir dans la photothèque
            </label>
            <input
              id="scan-library-image"
              type="file"
              accept="image/*"
              onChange={(event) => void handleFileSelection(event)}
              className="sr-only"
            />
          </div>
        </div>
      ) : null}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      {preparedImage && previewUrl && stage !== "selection" && stage !== "review" ? (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-3xl bg-[#292925] p-2">
            {/* Aperçu issu exclusivement de l’URL Blob locale. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Aperçu de la page à analyser"
              className="max-h-[58dvh] w-full rounded-2xl object-contain"
            />
          </div>

          {!isProcessing ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-label="Faire pivoter l’image vers la gauche"
                  onClick={() =>
                    void prepareSelectedImage(rotation - 90, imageMode)
                  }
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm font-semibold"
                >
                  <Icon name="rotate-left" size={19} />
                  Gauche
                </button>
                <button
                  type="button"
                  aria-label="Faire pivoter l’image vers la droite"
                  onClick={() =>
                    void prepareSelectedImage(rotation + 90, imageMode)
                  }
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm font-semibold"
                >
                  Droite
                  <Icon name="rotate-right" size={19} />
                </button>
              </div>

              <fieldset>
                <legend className="text-sm font-semibold">
                  Traitement de l’image
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { value: "original" as const, label: "Original" },
                    {
                      value: "enhanced" as const,
                      label: "Contraste amélioré",
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={imageMode === option.value}
                      onClick={() =>
                        void prepareSelectedImage(rotation, option.value)
                      }
                      className={`min-h-12 rounded-2xl px-3 text-xs font-semibold ${
                        imageMode === option.value
                          ? "bg-[var(--moss)] text-white"
                          : "border border-[var(--line)] bg-white text-[var(--muted)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="ocr-language"
                  className="mb-2 block text-sm font-semibold"
                >
                  Langue principale de la page
                </label>
                <select
                  id="ocr-language"
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as OcrLanguage)
                  }
                  className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-white px-4 text-base"
                >
                  {OCR_LANGUAGES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Choisissez la langue principale de la page pour améliorer la
                  reconnaissance.
                </p>
              </div>

              {!languagePrepared ? (
                <p className="rounded-2xl bg-[var(--paper-deep)] p-4 text-xs leading-5 text-[var(--muted)]">
                  La première analyse dans cette langue peut prendre un peu plus
                  de temps, car le moteur de reconnaissance doit être préparé.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void runRecognition()}
                className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
              >
                Lancer la reconnaissance
              </button>

              <div className="grid grid-cols-2 gap-2">
                <label
                  htmlFor="scan-replace-image"
                  className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 text-center text-xs font-semibold text-[var(--moss)]"
                >
                  Choisir une autre image
                </label>
                <input
                  id="scan-replace-image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleFileSelection(event)}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={resetPhoto}
                  className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--clay)]"
                >
                  Reprendre une photo
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {isProcessing ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <p className="font-semibold">
            {stage === "preparingImage"
              ? "Préparation de l’image"
              : progress?.label ?? "Préparation du moteur"}
          </p>
          {progress?.progress !== null && progress?.progress !== undefined ? (
            <>
              <div
                role="progressbar"
                aria-label={progress.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.progress * 100)}
                className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--moss)] transition-[width]"
                  style={{ width: `${Math.round(progress.progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs text-[var(--muted)]">
                {Math.round(progress.progress * 100)} %
              </p>
            </>
          ) : null}
          {stage !== "preparingImage" ? (
            <button
              type="button"
              onClick={() => void cancelRecognition()}
              className="mt-4 min-h-11 w-full rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--clay)]"
            >
              Annuler
            </button>
          ) : null}
        </div>
      ) : null}

      {stage === "selection" && result && previewUrl ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ocr-result-language" className="sr-only">
                Langue de reconnaissance
              </label>
              <select
                id="ocr-result-language"
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as OcrLanguage);
                  setSettingsChanged(true);
                }}
                className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
              >
                {OCR_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setImageMode((current) =>
                  current === "original" ? "enhanced" : "original",
                );
                setSettingsChanged(true);
              }}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
            >
              {imageMode === "original" ? "Original" : "Contraste amélioré"}
            </button>
          </div>
          {settingsChanged ? (
            <div className="rounded-2xl bg-[var(--paper-deep)] p-4">
              <p className="text-xs leading-5 text-[var(--muted)]">
                Le résultat affiché reste celui en{" "}
                {languageLabels[result.language]}. Relancez l’OCR pour appliquer
                les nouveaux réglages.
              </p>
              <button
                type="button"
                onClick={() => void reanalyzeWithSettings()}
                className="mt-2 min-h-11 text-sm font-semibold text-[var(--moss)]"
              >
                Relancer l’analyse
              </button>
            </div>
          ) : null}
          <OcrWordSelector
            imageUrl={previewUrl}
            result={result}
            onPassageSelected={openReview}
            onRestart={restartFromSelection}
          />
        </div>
      ) : null}

      {stage === "review" ? (
        <section aria-labelledby="ocr-review-title" className="space-y-4">
          <div>
            <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
              Vérification
            </p>
            <h2 id="ocr-review-title" className="mt-1 text-xl font-semibold">
              Corrigez le passage
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Vérifiez le texte : la reconnaissance peut parfois confondre
              certains caractères.
            </p>
          </div>
          <textarea
            id="ocr-review-text"
            value={reviewText}
            onChange={(event) => {
              setReviewText(event.target.value);
              setReviewError(null);
            }}
            rows={12}
            className="w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-4 text-base leading-7"
          />
          <p className="text-right text-xs text-[var(--muted)]">
            {reviewText.length} caractères
          </p>
          {reviewError ? (
            <StatusMessage tone="error">{reviewError}</StatusMessage>
          ) : null}
          <div className="grid gap-2">
            <button
              type="button"
              onClick={addPassageToNote}
              className="min-h-13 rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white"
            >
              Ajouter à ma note
            </button>
            <button
              type="button"
              onClick={() => setStage("selection")}
              className="min-h-11 rounded-xl text-sm font-semibold text-[var(--moss)]"
            >
              Retour à la sélection
            </button>
          </div>
        </section>
      ) : null}

      {!isProcessing ? (
        <button
          type="button"
          onClick={onExitToManual}
          className="min-h-11 w-full text-sm font-semibold text-[var(--muted)]"
        >
          Abandonner le scan et saisir manuellement
        </button>
      ) : null}
    </section>
  );
}
