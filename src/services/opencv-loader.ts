"use client";

import type { OpenCvLoaderState } from "@/domain/document-types";
import type { OpenCv } from "@/services/opencv-types";

export const OPENCV_VERSION = "4.13.0";
export const OPENCV_SCRIPT_PATH = `/vendor/opencv/${OPENCV_VERSION}/opencv.js`;
export const OPENCV_SHA256 =
  "63366510248ADF3A7EDDF3E793DD825404EFB7DF3749F4D6F8557C7FA4CA8AA0";

type OpenCvWindow = Window &
  typeof globalThis & {
    cv?: OpenCv | PromiseLike<OpenCv>;
  };

let loaderState: OpenCvLoaderState = "idle";
let sharedPromise: Promise<OpenCv> | null = null;

export class OpenCvLoadError extends Error {
  constructor(
    readonly code: "offline" | "script" | "initialization" | "unsupported",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenCvLoadError";
  }
}

export function getOpenCvLoaderState(): OpenCvLoaderState {
  return loaderState;
}

export async function isOpenCvCached(): Promise<boolean> {
  if (!("caches" in globalThis)) return false;
  return Boolean(await caches.match(OPENCV_SCRIPT_PATH));
}

function resolveGlobalOpenCv(): Promise<OpenCv> {
  const candidate = (window as OpenCvWindow).cv;
  if (!candidate) {
    return Promise.reject(
      new OpenCvLoadError(
        "initialization",
        "Le module de redressement n’a pas pu s’initialiser.",
      ),
    );
  }
  if (typeof (candidate as { then?: unknown }).then === "function") {
    delete (candidate as { then?: unknown }).then;
  }
  return Promise.resolve(candidate as OpenCv);
}

export function loadOpenCv(): Promise<OpenCv> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(
      new OpenCvLoadError(
        "unsupported",
        "Le redressement de page est disponible uniquement dans le navigateur.",
      ),
    );
  }
  if (loaderState === "ready") return resolveGlobalOpenCv();
  if (sharedPromise) return sharedPromise;

  loaderState = "loading";
  sharedPromise = (async () => {
    const cached = await isOpenCvCached().catch(() => false);
    if (navigator.onLine === false && !cached) {
      throw new OpenCvLoadError(
        "offline",
        "Le module de redressement doit être chargé une première fois avec une connexion. Vous pouvez continuer sans redresser.",
      );
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-brainbook-opencv="${OPENCV_VERSION}"]`,
    );
    if (!existing) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => {
          reject(
            new OpenCvLoadError(
              "script",
              "Le chargement du module de redressement a pris trop de temps.",
            ),
          );
        }, 45_000);
        script.src = OPENCV_SCRIPT_PATH;
        script.async = true;
        script.dataset.brainbookOpencv = OPENCV_VERSION;
        script.onload = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        script.onerror = () => {
          window.clearTimeout(timeout);
          script.remove();
          reject(
            new OpenCvLoadError(
              "script",
              "Le module de redressement n’a pas pu être chargé. Vérifiez votre connexion ou continuez sans redresser.",
            ),
          );
        };
        document.head.append(script);
      });
    }

    const cv = await resolveGlobalOpenCv();
    loaderState = "ready";
    return cv;
  })().catch((error: unknown) => {
    loaderState = "error";
    sharedPromise = null;
    if (error instanceof OpenCvLoadError) throw error;
    throw new OpenCvLoadError(
      "initialization",
      "Le module de redressement n’a pas pu s’initialiser. Vous pouvez continuer sans redresser.",
      { cause: error },
    );
  });

  return sharedPromise;
}

export function resetOpenCvLoaderForTests(): void {
  loaderState = "idle";
  sharedPromise = null;
}
