import type { OcrLanguage, OcrProgress, OcrResult } from "@/domain/ocr-types";
import { transformOcrPage } from "@/domain/ocr-transform";

const OCR_METADATA_CACHE = "brainbook-ocr-metadata-v1";
const OCR_READY_PATH = "/__brainbook_ocr_ready__";

export type OcrServiceErrorCode =
  | "offline_model_missing"
  | "engine_load_failed"
  | "recognition_failed"
  | "cancelled"
  | "busy";

export class OcrServiceError extends Error {
  constructor(
    readonly code: OcrServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OcrServiceError";
  }
}

type TesseractModule = typeof import("tesseract.js");
type TesseractWorker = Awaited<
  ReturnType<TesseractModule["createWorker"]>
>;

function markerRequest(language: OcrLanguage): Request {
  return new Request(
    new URL(`${OCR_READY_PATH}/${language}`, window.location.origin),
  );
}

export async function isOcrLanguagePrepared(
  language: OcrLanguage,
): Promise<boolean> {
  if (!("caches" in window)) return false;
  const cache = await caches.open(OCR_METADATA_CACHE);
  return Boolean(await cache.match(markerRequest(language)));
}

async function markOcrLanguagePrepared(
  language: OcrLanguage,
): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open(OCR_METADATA_CACHE);
  await cache.put(
    markerRequest(language),
    new Response("ready", {
      headers: { "content-type": "text/plain" },
    }),
  );
}

function progressFromLogger(
  status: string,
  progress: number,
): OcrProgress {
  if (status.includes("language") || status.includes("initializing api")) {
    return {
      phase: "language",
      label: "Chargement de la langue",
      progress: Number.isFinite(progress) ? progress : null,
    };
  }
  if (status.includes("recognizing")) {
    return {
      phase: "recognition",
      label: "Analyse de la page",
      progress: Number.isFinite(progress) ? progress : null,
    };
  }
  return {
    phase: "engine",
    label: "Chargement du moteur de reconnaissance",
    progress: Number.isFinite(progress) ? progress : null,
  };
}

export class BrowserOcrSession {
  private worker: TesseractWorker | null = null;
  private workerPromise: Promise<TesseractWorker> | null = null;
  private workerLanguage: OcrLanguage | null = null;
  private lifecycleVersion = 0;
  private activeOperation = 0;
  private busy = false;

  constructor(
    private readonly onProgress: (progress: OcrProgress) => void,
  ) {}

  private async ensureWorker(
    language: OcrLanguage,
  ): Promise<TesseractWorker> {
    if (this.worker && this.workerLanguage === language) {
      return this.worker;
    }

    if (this.worker || this.workerPromise) {
      await this.terminateWorker();
    }

    if (
      navigator.onLine === false &&
      !(await isOcrLanguagePrepared(language))
    ) {
      throw new OcrServiceError(
        "offline_model_missing",
        "Cette langue n’a pas encore été préparée sur cet appareil. Reconnectez-vous puis réessayez ; votre photo est conservée.",
      );
    }

    const lifecycleAtStart = this.lifecycleVersion;
    this.onProgress({
      phase: "engine",
      label: "Chargement du moteur de reconnaissance",
      progress: null,
    });

    this.workerPromise = import("tesseract.js")
      .then(({ createWorker, OEM }) =>
        createWorker(language, OEM.LSTM_ONLY, {
          logger: (message) => {
            if (lifecycleAtStart !== this.lifecycleVersion) return;
            this.onProgress(
              progressFromLogger(message.status, message.progress),
            );
          },
          errorHandler: (error) => {
            if (process.env.NODE_ENV === "development") {
              console.error("Erreur du worker OCR", error);
            }
          },
        }),
      )
      .catch((error: unknown) => {
        throw new OcrServiceError(
          "engine_load_failed",
          "Le moteur de reconnaissance ou le modèle de langue n’a pas pu être chargé. Vérifiez votre connexion puis réessayez.",
          { cause: error },
        );
      });

    try {
      const worker = await this.workerPromise;
      if (lifecycleAtStart !== this.lifecycleVersion) {
        throw new OcrServiceError(
          "cancelled",
          "La reconnaissance a été annulée.",
        );
      }

      this.worker = worker;
      this.workerLanguage = language;
      await markOcrLanguagePrepared(language).catch(() => undefined);
      return worker;
    } finally {
      this.workerPromise = null;
    }
  }

  async recognize(
    image: Blob,
    language: OcrLanguage,
    dimensions: { width: number; height: number },
  ): Promise<OcrResult> {
    if (this.busy) {
      throw new OcrServiceError(
        "busy",
        "Une reconnaissance est déjà en cours.",
      );
    }

    this.busy = true;
    const operation = ++this.activeOperation;
    const startedAt = performance.now();

    try {
      const worker = await this.ensureWorker(language);
      if (operation !== this.activeOperation) {
        throw new OcrServiceError(
          "cancelled",
          "La reconnaissance a été annulée.",
        );
      }

      this.onProgress({
        phase: "recognition",
        label: "Analyse de la page",
        progress: 0,
      });
      const response = await worker.recognize(
        image,
        {},
        { text: true, blocks: true },
      );
      if (operation !== this.activeOperation) {
        throw new OcrServiceError(
          "cancelled",
          "La reconnaissance a été annulée.",
        );
      }

      this.onProgress({
        phase: "organization",
        label: "Organisation du texte",
        progress: null,
      });
      return transformOcrPage(response.data, {
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        language,
        processingDurationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      if (error instanceof OcrServiceError) throw error;
      throw new OcrServiceError(
        "recognition_failed",
        "La reconnaissance a été interrompue. Votre photo est conservée : vous pouvez réessayer.",
        { cause: error },
      );
    } finally {
      if (operation === this.activeOperation) this.busy = false;
    }
  }

  async cancel(): Promise<void> {
    this.activeOperation += 1;
    this.busy = false;
    await this.terminateWorker();
  }

  async terminate(): Promise<void> {
    this.activeOperation += 1;
    this.busy = false;
    await this.terminateWorker();
  }

  private async terminateWorker(): Promise<void> {
    this.lifecycleVersion += 1;
    const worker = this.worker;
    const pendingWorker = this.workerPromise;
    this.worker = null;
    this.workerPromise = null;
    this.workerLanguage = null;

    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
    if (pendingWorker) {
      await pendingWorker
        .then((createdWorker) => createdWorker.terminate())
        .catch(() => undefined);
    }
  }
}
