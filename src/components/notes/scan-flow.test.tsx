// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanFlow } from "@/components/notes/scan-flow";

const mocks = vi.hoisted(() => ({
  prepareOcrImage: vi.fn(),
  recognizePageWithAi: vi.fn(),
}));

vi.mock("@/lib/ocr-image-processing", () => ({
  OcrImageError: class OcrImageError extends Error {},
  prepareOcrImage: mocks.prepareOcrImage,
}));

vi.mock("@/services/ai-recognition-service", () => ({
  AiRecognitionError: class AiRecognitionError extends Error {
    code = "recognition_failed";
  },
  recognizePageWithAi: mocks.recognizePageWithAi,
}));

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Bouton introuvable : ${text}`);
  }
  return found;
}

describe("ScanFlow quick scan", () => {
  let container: HTMLDivElement;
  let root: Root;
  let file: File;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.prepareOcrImage.mockResolvedValue({
      blob: new Blob(["prepared"], { type: "image/jpeg" }),
      width: 1_200,
      height: 1_600,
      rotation: 0,
      mode: "original",
    });
    mocks.recognizePageWithAi.mockResolvedValue({
      text: "Les mythes organisent les sociétés.",
      model: "gpt-5.4-mini-2026-03-17",
      processingDurationMs: 800,
      usage: {
        inputTokens: 900,
        outputTokens: 12,
      },
    });
    file = new File(["image"], "page.jpg", { type: "image/jpeg" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("affiche directement la photo avec le seul bouton Envoyer", () => {
    act(() =>
      root.render(<ScanFlow file={file} onPassageReady={vi.fn()} />),
    );

    expect(
      document.querySelector('img[alt="Page à envoyer à la reconnaissance IA"]'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("Redresser");
    expect(document.body.textContent).not.toContain("Langue principale");
    expect([...document.querySelectorAll("button")].map((item) =>
      item.textContent?.trim(),
    )).toEqual(["Envoyer"]);
  });

  it("prépare puis envoie la photo en un appui et ajoute directement le texte choisi", async () => {
    const onPassageReady = vi.fn();
    act(() =>
      root.render(
        <ScanFlow file={file} onPassageReady={onPassageReady} />,
      ),
    );

    await act(async () => {
      button("Envoyer").click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.prepareOcrImage).toHaveBeenCalledWith(file, 0, "original");
    expect(mocks.recognizePageWithAi).toHaveBeenCalledWith(
      expect.any(Blob),
      "fra",
      expect.any(AbortSignal),
    );
    expect(document.querySelector("#ai-recognized-text")).toHaveProperty(
      "value",
      "Les mythes organisent les sociétés.",
    );

    act(() => button("Utiliser tout le texte").click());
    expect(onPassageReady).toHaveBeenCalledWith(
      "Les mythes organisent les sociétés.",
    );
  });
});
