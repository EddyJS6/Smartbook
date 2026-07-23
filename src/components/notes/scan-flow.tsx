"use client";

import { useEffect, useRef, useState } from "react";
import {
  fallbackPageCorners,
  rotatePageCorners,
} from "@/domain/document-geometry";
import type {
  PageCorners,
  PageDetectionResult,
  PerspectiveResult,
  PhotographWarning,
} from "@/domain/document-types";
import type {
  OcrImageMode,
  OcrLanguage,
  ScanStage,
} from "@/domain/ocr-types";
import { OCR_LANGUAGES } from "@/domain/ocr-types";
import { normalizeMultilineText } from "@/domain/note-validation";
import { useTemporaryObjectUrl } from "@/hooks/use-temporary-object-url";
import {
  OcrImageError,
  normalizeRightAngle,
  prepareOcrImage,
  type PreparedOcrImage,
} from "@/lib/ocr-image-processing";
import {
  detectPage,
  DocumentProcessingError,
  rectifyPage,
} from "@/services/document-processing-service";
import { OpenCvLoadError } from "@/services/opencv-loader";
import { terminateOpenCvWorker } from "@/services/opencv-worker-client";
import {
  AiRecognitionError,
  recognizePageWithAi,
  type AiRecognitionResult,
} from "@/services/ai-recognition-service";
import { AiTextSelector } from "@/components/notes/ai-text-selector";
import { PageCornerEditor } from "@/components/notes/page-corner-editor";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";

type ScanFlowProps = {
  onPassageReady: (passage: string) => void;
  onExitToManual: () => void;
};

const languageLabels = Object.fromEntries(
  OCR_LANGUAGES.map((language) => [language.code, language.label]),
) as Record<OcrLanguage, string>;

const IMAGE_MODES: { value: OcrImageMode; label: string }[] = [
  { value: "original", label: "Couleur originale" },
  { value: "grayscale", label: "Niveaux de gris" },
  { value: "enhanced", label: "Contraste renforcé" },
];

function reportScanError(error: unknown): string {
  if (process.env.NODE_ENV === "development") {
    console.error("Échec du parcours scanner", error);
  }
  if (
    error instanceof OcrImageError ||
    error instanceof AiRecognitionError ||
    error instanceof DocumentProcessingError ||
    error instanceof OpenCvLoadError
  ) {
    return error.message;
  }
  return "Une erreur inattendue a interrompu le scan. Votre photo est conservée : vous pouvez réessayer.";
}

function perspectiveToPrepared(
  result: PerspectiveResult,
): PreparedOcrImage {
  return {
    blob: result.blob,
    width: result.width,
    height: result.height,
    rotation: 0,
    mode: result.mode,
  };
}

export function ScanFlow({
  onPassageReady,
  onExitToManual,
}: ScanFlowProps) {
  const [stage, setStage] = useState<ScanStage>("idle");
  const [sourceImage, setSourceImage] = useState<PreparedOcrImage | null>(null);
  const [preparedImage, setPreparedImage] =
    useState<PreparedOcrImage | null>(null);
  const [perspective, setPerspective] = useState<PerspectiveResult | null>(null);
  const [corners, setCorners] = useState<PageCorners>(fallbackPageCorners());
  const [detection, setDetection] = useState<PageDetectionResult | null>(null);
  const [photographWarnings, setPhotographWarnings] = useState<
    PhotographWarning[]
  >([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [wasAutomaticallyDetected, setWasAutomaticallyDetected] =
    useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageMode, setImageMode] = useState<OcrImageMode>("original");
  const [language, setLanguage] = useState<OcrLanguage>("fra");
  const [result, setResult] = useState<AiRecognitionResult | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const fileRef = useRef<File | null>(null);
  const mountedRef = useRef(true);
  const preparationIdRef = useRef(0);
  const detectionIdRef = useRef(0);
  const recognitionIdRef = useRef(0);
  const documentAbortRef = useRef<AbortController | null>(null);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const sourceUrl = useTemporaryObjectUrl(sourceImage?.blob ?? null);
  const previewUrl = useTemporaryObjectUrl(preparedImage?.blob ?? null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      preparationIdRef.current += 1;
      detectionIdRef.current += 1;
      recognitionIdRef.current += 1;
      documentAbortRef.current?.abort();
      documentAbortRef.current = null;
      recognitionAbortRef.current?.abort();
      recognitionAbortRef.current = null;
      fileRef.current = null;
      terminateOpenCvWorker();
    };
  }, []);

  const invalidateRecognition = () => {
    recognitionIdRef.current += 1;
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    setResult(null);
    setReviewText("");
    setReviewError(null);
    setSettingsChanged(false);
  };

  const runAutomaticDetection = async (
    image = sourceImage,
  ): Promise<void> => {
    if (!image) return;
    documentAbortRef.current?.abort();
    const controller = new AbortController();
    documentAbortRef.current = controller;
    const detectionId = ++detectionIdRef.current;
    setIsDetecting(true);
    setError(null);

    try {
      const nextDetection = await detectPage(image.blob, controller.signal);
      if (
        !mountedRef.current ||
        detectionId !== detectionIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setDetection(nextDetection);
      setPhotographWarnings(nextDetection.photographWarnings);
      if (nextDetection.corners) {
        setCorners(nextDetection.corners);
        setWasAutomaticallyDetected(true);
      } else {
        setWasAutomaticallyDetected(false);
      }
    } catch (failure) {
      if (
        !mountedRef.current ||
        detectionId !== detectionIdRef.current ||
        (failure instanceof DocumentProcessingError &&
          failure.code === "cancelled")
      ) {
        return;
      }
      setDetection({
        status: "notDetected",
        processingWidth: image.width,
        processingHeight: image.height,
        warning:
          "La détection automatique n’est pas disponible. Placez les quatre coins manuellement.",
        photographWarnings: [],
      });
      setError(reportScanError(failure));
      setWasAutomaticallyDetected(false);
    } finally {
      if (
        mountedRef.current &&
        detectionId === detectionIdRef.current
      ) {
        setIsDetecting(false);
        documentAbortRef.current = null;
      }
    }
  };

  const prepareSource = async (
    nextRotation: number,
    nextCorners: PageCorners,
    detectAfterwards: boolean,
  ): Promise<void> => {
    const file = fileRef.current;
    if (!file) {
      setError("Aucune image n’a été choisie.");
      setStage("idle");
      return;
    }

    const preparationId = ++preparationIdRef.current;
    documentAbortRef.current?.abort();
    detectionIdRef.current += 1;
    setIsDetecting(false);
    setStage("preparingImage");
    setError(null);

    try {
      const prepared = await prepareOcrImage(file, nextRotation, "original");
      if (
        !mountedRef.current ||
        preparationId !== preparationIdRef.current
      ) {
        return;
      }
      setSourceImage(prepared);
      setPreparedImage(null);
      setPerspective(null);
      setRotation(prepared.rotation);
      setCorners(nextCorners);
      setDetection(null);
      setPhotographWarnings([]);
      setWasAutomaticallyDetected(false);
      invalidateRecognition();
      setStage("adjustingPage");
      if (detectAfterwards) void runAutomaticDetection(prepared);
    } catch (failure) {
      if (
        !mountedRef.current ||
        preparationId !== preparationIdRef.current
      ) {
        return;
      }
      setSourceImage(null);
      setPreparedImage(null);
      setError(reportScanError(failure));
      setStage("idle");
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
    setImageMode("original");
    setRotation(0);
    await prepareSource(0, fallbackPageCorners(), true);
  };

  const rotateSource = async (direction: "left" | "right") => {
    const delta = direction === "right" ? 90 : -90;
    const nextRotation = normalizeRightAngle(rotation + delta);
    const nextCorners = rotatePageCorners(corners, delta);
    await prepareSource(nextRotation, nextCorners, true);
  };

  const performRectification = async (
    mode = imageMode,
  ): Promise<PreparedOcrImage | null> => {
    if (!sourceImage) return null;
    documentAbortRef.current?.abort();
    const controller = new AbortController();
    documentAbortRef.current = controller;
    setStage("rectifyingPage");
    setError(null);

    try {
      const nextPerspective = await rectifyPage(sourceImage.blob, corners, {
        mode,
        wasAutomaticallyDetected,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return null;
      const prepared = perspectiveToPrepared(nextPerspective);
      setPerspective(nextPerspective);
      setPreparedImage(prepared);
      setImageMode(mode);
      invalidateRecognition();
      setStage("pagePreview");
      return prepared;
    } catch (failure) {
      if (
        !mountedRef.current ||
        (failure instanceof DocumentProcessingError &&
          failure.code === "cancelled")
      ) {
        return null;
      }
      setError(reportScanError(failure));
      setStage("adjustingPage");
      return null;
    } finally {
      if (documentAbortRef.current === controller) {
        documentAbortRef.current = null;
      }
    }
  };

  const prepareWithoutRectification = async (
    mode = imageMode,
  ): Promise<PreparedOcrImage | null> => {
    if (!sourceImage) return null;
    const preparationId = ++preparationIdRef.current;
    setStage("preparingImage");
    setError(null);
    try {
      const file = new File([sourceImage.blob], "page-brainbook.jpg", {
        type: sourceImage.blob.type || "image/jpeg",
      });
      const prepared =
        mode === "original"
          ? { ...sourceImage, mode: "original" as const }
          : await prepareOcrImage(file, 0, mode);
      if (
        !mountedRef.current ||
        preparationId !== preparationIdRef.current
      ) {
        return null;
      }
      setPerspective(null);
      setPreparedImage(prepared);
      setImageMode(mode);
      invalidateRecognition();
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
      setStage("adjustingPage");
      return null;
    }
  };

  const prepareActiveMode = async (
    mode: OcrImageMode,
  ): Promise<PreparedOcrImage | null> => {
    if (perspective) return performRectification(mode);
    return prepareWithoutRectification(mode);
  };

  const runRecognition = async (
    image = preparedImage,
  ): Promise<void> => {
    if (!image) {
      setError("Préparez une image avant de lancer la reconnaissance.");
      return;
    }

    const recognitionId = ++recognitionIdRef.current;
    recognitionAbortRef.current?.abort();
    const controller = new AbortController();
    recognitionAbortRef.current = controller;
    setError(null);
    setStage("sendingToAi");

    try {
      const nextResult = await recognizePageWithAi(
        image.blob,
        language,
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
        setError("Aucun texte n’a pu être détecté sur cette image.");
        setStage("readyForOcr");
        return;
      }

      setResult(nextResult);
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
        failure instanceof AiRecognitionError &&
        failure.code === "cancelled"
      ) {
        return;
      }
      setError(reportScanError(failure));
      setStage("readyForOcr");
    } finally {
      if (recognitionAbortRef.current === controller) {
        recognitionAbortRef.current = null;
      }
    }
  };

  const cancelProcessing = async () => {
    documentAbortRef.current?.abort();
    documentAbortRef.current = null;
    recognitionIdRef.current += 1;
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    if (!mountedRef.current) return;
    if (stage === "rectifyingPage") setStage("adjustingPage");
    else setStage(preparedImage ? "readyForOcr" : "adjustingPage");
  };

  const restartFromSelection = () => {
    setResult(null);
    setReviewText("");
    setReviewError(null);
    setSettingsChanged(false);
    setStage("readyForOcr");
  };

  const reanalyzeWithSettings = async () => {
    const prepared = await prepareActiveMode(imageMode);
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
    detectionIdRef.current += 1;
    recognitionIdRef.current += 1;
    documentAbortRef.current?.abort();
    documentAbortRef.current = null;
    fileRef.current = null;
    setSourceImage(null);
    setPreparedImage(null);
    setPerspective(null);
    setCorners(fallbackPageCorners());
    setDetection(null);
    setPhotographWarnings([]);
    setIsDetecting(false);
    setResult(null);
    setReviewText("");
    setError(null);
    setSettingsChanged(false);
    setRotation(0);
    setImageMode("original");
    setStage("idle");
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    terminateOpenCvWorker();
  };

  const isOcrProcessing = stage === "sendingToAi";

  return (
    <section className="mt-6 space-y-5" aria-label="Scanner une page">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
            <Icon name="shield" size={19} />
          </span>
          <p className="text-xs leading-5 text-[var(--muted)]">
            La détection et le redressement restent sur cet appareil. Pour la
            reconnaissance, la page préparée est envoyée temporairement à
            OpenAI, puis seul le texte choisi est enregistré dans BrainBook.
          </p>
        </div>
      </div>

      {stage === "idle" ? (
        <div className="space-y-5">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
            <h2 className="font-semibold">Photographiez une seule page</h2>
            <ul className="mt-3 space-y-1.5 text-sm leading-5 text-[var(--muted)]">
              <li>• Aplatissez doucement la page sans masquer le texte.</li>
              <li>• Gardez le téléphone parallèle et les quatre bords visibles.</li>
              <li>• Évitez les ombres et rapprochez-vous pour garder le texte net.</li>
              <li>
                • Près de la reliure, réduisez la courbure : une forte courbure
                ne peut pas être entièrement corrigée.
              </li>
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

      {error && stage !== "adjustingPage" ? (
        <StatusMessage tone="error">{error}</StatusMessage>
      ) : null}

      {stage === "preparingImage" ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <p className="font-semibold">Préparation locale de l’image…</p>
        </div>
      ) : null}

      {stage === "adjustingPage" && sourceImage && sourceUrl ? (
        <PageCornerEditor
          imageUrl={sourceUrl}
          imageWidth={sourceImage.width}
          imageHeight={sourceImage.height}
          corners={corners}
          detection={detection}
          isDetecting={isDetecting}
          error={error}
          warnings={photographWarnings}
          onCornersChange={(nextCorners) => {
            setCorners(nextCorners);
            setWasAutomaticallyDetected(false);
            setPerspective(null);
            setPreparedImage(null);
            invalidateRecognition();
          }}
          onAutomaticDetection={() => void runAutomaticDetection()}
          onRotate={(direction) => void rotateSource(direction)}
          onRetake={resetPhoto}
          onRectify={() => void performRectification()}
          onContinueWithoutRectifying={() =>
            void prepareWithoutRectification()
          }
        />
      ) : null}

      {stage === "rectifyingPage" ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <p className="font-semibold">Redressement de la page…</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Recadrage, correction de perspective et préparation de l’image.
          </p>
          <button
            type="button"
            onClick={() => void cancelProcessing()}
            className="mt-4 min-h-11 w-full rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--clay)]"
          >
            Annuler
          </button>
        </div>
      ) : null}

      {stage === "pagePreview" &&
      sourceImage &&
      sourceUrl &&
      preparedImage &&
      previewUrl ? (
        <section aria-labelledby="page-preview-title" className="space-y-4">
          <div>
            <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
              Vérification
            </p>
            <h2 id="page-preview-title" className="mt-1 text-xl font-semibold">
              Comparer avant et après
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <figure className="min-w-0">
              <div className="flex aspect-[3/4] items-center overflow-hidden rounded-2xl bg-[#292925] p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sourceUrl}
                  alt="Photo originale"
                  className="max-h-full w-full object-contain"
                />
              </div>
              <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">
                Avant
              </figcaption>
            </figure>
            <figure className="min-w-0">
              <div className="flex aspect-[3/4] items-center overflow-hidden rounded-2xl bg-[#292925] p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Page redressée"
                  className="max-h-full w-full object-contain"
                />
              </div>
              <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">
                Après
              </figcaption>
            </figure>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">
              Préparation pour l’OCR
            </legend>
            <div className="mt-2 grid gap-2">
              {IMAGE_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={imageMode === option.value}
                  onClick={() => void performRectification(option.value)}
                  className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${
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

          <button
            type="button"
            onClick={() => setStage("readyForOcr")}
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            Utiliser la page redressée
          </button>
          <button
            type="button"
            onClick={() => {
              setPreparedImage(null);
              setPerspective(null);
              invalidateRecognition();
              setStage("adjustingPage");
            }}
            className="min-h-11 w-full text-sm font-semibold text-[var(--moss)]"
          >
            Modifier les quatre coins
          </button>
          <button
            type="button"
            onClick={() => void prepareWithoutRectification()}
            className="min-h-11 w-full text-sm font-semibold text-[var(--muted)]"
          >
            Continuer sans redresser
          </button>
        </section>
      ) : null}

      {stage === "readyForOcr" && preparedImage && previewUrl ? (
        <section className="space-y-5">
          <div className="overflow-hidden rounded-3xl bg-[#292925] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Page prête à analyser"
              className="max-h-[58dvh] w-full rounded-2xl object-contain"
            />
          </div>
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
          </div>
          <p className="rounded-2xl bg-[var(--paper-deep)] p-4 text-xs leading-5 text-[var(--muted)]">
            Une connexion Internet est nécessaire. La page préparée sera
            transmise à OpenAI pour être convertie en texte et ne sera pas
            conservée dans BrainBook.
          </p>
          <button
            type="button"
            onClick={() => void runRecognition()}
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            Lancer la reconnaissance IA
          </button>
          <button
            type="button"
            onClick={() =>
              setStage(perspective ? "pagePreview" : "adjustingPage")
            }
            className="min-h-11 w-full text-sm font-semibold text-[var(--moss)]"
          >
            Revenir à la préparation
          </button>
          <button
            type="button"
            onClick={resetPhoto}
            className="min-h-11 w-full text-sm font-semibold text-[var(--clay)]"
          >
            Reprendre la photo
          </button>
        </section>
      ) : null}

      {isOcrProcessing ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <p className="font-semibold">Reconnaissance IA en cours</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            La page est transmise de façon sécurisée et convertie en texte.
            Cela peut prendre quelques secondes.
          </p>
          <div
            role="progressbar"
            aria-label="Reconnaissance IA en cours"
            className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--moss)]" />
          </div>
          <button
            type="button"
            onClick={() => void cancelProcessing()}
            className="mt-4 min-h-11 w-full rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--clay)]"
          >
            Annuler
          </button>
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
            <label className="sr-only" htmlFor="ocr-result-image-mode">
              Préparation de l’image
            </label>
            <select
              id="ocr-result-image-mode"
              value={imageMode}
              onChange={(event) => {
                setImageMode(event.target.value as OcrImageMode);
                setSettingsChanged(true);
              }}
              className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold"
            >
              {IMAGE_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          {settingsChanged ? (
            <div className="rounded-2xl bg-[var(--paper-deep)] p-4">
              <p className="text-xs leading-5 text-[var(--muted)]">
                Le résultat affiché utilise encore les réglages précédents.
                Relancez la reconnaissance IA pour appliquer le{" "}
                {languageLabels[language].toLocaleLowerCase("fr")} et la
                nouvelle préparation d’image.
              </p>
              <button
                type="button"
                onClick={() => void reanalyzeWithSettings()}
                className="mt-2 min-h-11 text-sm font-semibold text-[var(--moss)]"
              >
                Relancer la reconnaissance IA
              </button>
            </div>
          ) : null}
          <AiTextSelector
            imageUrl={previewUrl}
            initialText={result.text}
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

      {!isOcrProcessing && stage !== "preparingImage" && stage !== "rectifyingPage" ? (
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
