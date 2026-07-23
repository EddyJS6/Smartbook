"use client";

import type {
  ImagePoint,
  OpenCvLoaderState,
} from "@/domain/document-types";
import type { OcrImageMode } from "@/domain/ocr-types";
import {
  isOpenCvCached,
  OpenCvLoadError,
} from "@/services/opencv-loader";

const WORKER_PATH = "/workers/document-processing-worker.js";

type DetectWorkerResult = {
  candidates: ImagePoint[][];
  mean: number;
  standardDeviation: number;
};

type RectifyWorkerResult = {
  buffer: ArrayBuffer;
};

type PendingRequest = {
  resolve: (value: DetectWorkerResult | RectifyWorkerResult) => void;
  reject: (reason: unknown) => void;
};

let worker: Worker | null = null;
let workerPromise: Promise<Worker> | null = null;
let state: OpenCvLoaderState = "idle";
let nextRequestId = 1;
let busy = false;
const pending = new Map<number, PendingRequest>();

export function getOpenCvWorkerState(): OpenCvLoaderState {
  return state;
}

function failPending(error: Error): void {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
  busy = false;
}

export function terminateOpenCvWorker(): void {
  worker?.terminate();
  worker = null;
  workerPromise = null;
  state = "idle";
  failPending(
    new OpenCvLoadError("initialization", "Le traitement a été annulé."),
  );
}

async function ensureWorker(): Promise<Worker> {
  if (worker && state === "ready") return worker;
  if (workerPromise) return workerPromise;
  if (!("Worker" in globalThis)) {
    throw new OpenCvLoadError(
      "unsupported",
      "Ce navigateur ne permet pas d’isoler le redressement. Vous pouvez continuer sans redresser.",
    );
  }

  state = "loading";
  workerPromise = (async () => {
    const cached = await isOpenCvCached().catch(() => false);
    if (navigator.onLine === false && !cached) {
      throw new OpenCvLoadError(
        "offline",
        "Le module de redressement doit être chargé une première fois avec une connexion. Vous pouvez continuer sans redresser.",
      );
    }

    return new Promise<Worker>((resolve, reject) => {
      const nextWorker = new Worker(WORKER_PATH);
      const timeout = window.setTimeout(() => {
        nextWorker.terminate();
        reject(
          new OpenCvLoadError(
            "initialization",
            "Le module de redressement a pris trop de temps à démarrer. Vous pouvez continuer sans redresser.",
          ),
        );
      }, 60_000);
      nextWorker.addEventListener("message", (event: MessageEvent) => {
        const message = event.data as {
          type: string;
          id?: number;
          result?: DetectWorkerResult | RectifyWorkerResult;
          message?: string;
        };
        if (message.type === "ready") {
          window.clearTimeout(timeout);
          worker = nextWorker;
          state = "ready";
          resolve(nextWorker);
          return;
        }
        if (message.type === "initError") {
          window.clearTimeout(timeout);
          nextWorker.terminate();
          reject(
            new OpenCvLoadError(
              "initialization",
              message.message ??
                "Le module de redressement n’a pas pu s’initialiser.",
            ),
          );
          return;
        }
        if (message.id === undefined) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        busy = false;
        if (message.type === "result" && message.result) {
          request.resolve(message.result);
        } else {
          request.reject(
            new Error(message.message ?? "Le traitement OpenCV a échoué."),
          );
        }
      });
      nextWorker.addEventListener("error", () => {
        window.clearTimeout(timeout);
        nextWorker.terminate();
        const error = new OpenCvLoadError(
          "script",
          "Le worker de redressement a été interrompu. Vous pouvez continuer sans redresser.",
        );
        if (worker === nextWorker) {
          worker = null;
          workerPromise = null;
          state = "error";
          failPending(error);
        }
        reject(error);
      });
      nextWorker.postMessage({ type: "init" });
    });
  })().catch((error: unknown) => {
    state = "error";
    worker = null;
    workerPromise = null;
    if (error instanceof OpenCvLoadError) throw error;
    throw new OpenCvLoadError(
      "initialization",
      "Le module de redressement n’a pas pu s’initialiser.",
      { cause: error },
    );
  });

  return workerPromise;
}

async function requestWorker<T extends DetectWorkerResult | RectifyWorkerResult>(
  message: Record<string, unknown>,
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<T> {
  if (busy) throw new Error("Un traitement de page est déjà en cours.");
  const activeWorker = await ensureWorker();
  if (signal?.aborted) {
    terminateOpenCvWorker();
    throw new DOMException("Aborted", "AbortError");
  }
  busy = true;
  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      terminateOpenCvWorker();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    pending.set(id, {
      resolve: (value) => {
        signal?.removeEventListener("abort", handleAbort);
        resolve(value as T);
      },
      reject: (error) => {
        signal?.removeEventListener("abort", handleAbort);
        reject(error);
      },
    });
    activeWorker.postMessage({ ...message, id, buffer }, [buffer]);
  });
}

export function detectPageInWorker(
  input: { buffer: ArrayBuffer; width: number; height: number },
  signal?: AbortSignal,
): Promise<DetectWorkerResult> {
  return requestWorker<DetectWorkerResult>(
    { type: "detect", width: input.width, height: input.height },
    input.buffer,
    signal,
  );
}

export function rectifyPageInWorker(
  input: {
    buffer: ArrayBuffer;
    width: number;
    height: number;
    outputWidth: number;
    outputHeight: number;
    sourcePoints: ImagePoint[];
    mode: OcrImageMode;
  },
  signal?: AbortSignal,
): Promise<RectifyWorkerResult> {
  return requestWorker<RectifyWorkerResult>(
    {
      type: "rectify",
      width: input.width,
      height: input.height,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
      sourcePoints: input.sourcePoints,
      mode: input.mode,
    },
    input.buffer,
    signal,
  );
}
