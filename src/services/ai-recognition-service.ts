"use client";

import type { OcrLanguage } from "@/domain/ocr-types";

export type AiRecognitionResult = {
  text: string;
  model: string;
  processingDurationMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

export type AiRecognitionErrorCode =
  | "offline"
  | "not_configured"
  | "too_large"
  | "rate_limited"
  | "cancelled"
  | "recognition_failed";

export class AiRecognitionError extends Error {
  constructor(
    readonly code: AiRecognitionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiRecognitionError";
  }
}

type ErrorResponse = {
  error?: string;
};

function errorFromStatus(status: number, message?: string) {
  if (status === 413 || status === 415) {
    return new AiRecognitionError(
      "too_large",
      message ??
        "L’image préparée est trop volumineuse pour la reconnaissance IA.",
    );
  }
  if (status === 429) {
    return new AiRecognitionError(
      "rate_limited",
      message ??
        "Trop de reconnaissances ont été lancées. Réessayez dans quelques minutes.",
    );
  }
  if (status === 503) {
    return new AiRecognitionError(
      "not_configured",
      message ??
        "La reconnaissance IA n’est pas encore configurée sur le serveur.",
    );
  }
  return new AiRecognitionError(
    "recognition_failed",
    message ??
      "La reconnaissance IA a échoué. Votre photo est conservée : vous pouvez réessayer.",
  );
}

export async function recognizePageWithAi(
  image: Blob,
  language: OcrLanguage,
  signal?: AbortSignal,
): Promise<AiRecognitionResult> {
  if (navigator.onLine === false) {
    throw new AiRecognitionError(
      "offline",
      "La reconnaissance IA nécessite une connexion Internet. Votre photo est conservée.",
    );
  }
  if (signal?.aborted) {
    throw new AiRecognitionError(
      "cancelled",
      "La reconnaissance IA a été annulée.",
    );
  }

  const formData = new FormData();
  formData.append(
    "image",
    new File([image], "page-brainbook.jpg", {
      type: image.type || "image/jpeg",
    }),
  );
  formData.append("language", language);

  try {
    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw errorFromStatus(response.status, payload.error);
    }

    const result = (await response.json()) as AiRecognitionResult;
    if (!result.text?.trim()) {
      throw new AiRecognitionError(
        "recognition_failed",
        "L’IA n’a renvoyé aucun texte exploitable pour cette page.",
      );
    }
    return {
      ...result,
      text: result.text.trim(),
    };
  } catch (error) {
    if (error instanceof AiRecognitionError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiRecognitionError(
        "cancelled",
        "La reconnaissance IA a été annulée.",
        { cause: error },
      );
    }
    throw new AiRecognitionError(
      "recognition_failed",
      "La connexion au service de reconnaissance IA a échoué. Votre photo est conservée.",
      { cause: error },
    );
  }
}
