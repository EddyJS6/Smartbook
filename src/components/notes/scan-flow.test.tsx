// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageDetectionResult } from "@/domain/document-types";
import { fallbackPageCorners } from "@/domain/document-geometry";
import { ScanFlow } from "@/components/notes/scan-flow";

const mocks = vi.hoisted(() => ({
  detectPage: vi.fn(),
  rectifyPage: vi.fn(),
  prepareOcrImage: vi.fn(),
}));

vi.mock("@/services/document-processing-service", () => ({
  detectPage: mocks.detectPage,
  rectifyPage: mocks.rectifyPage,
  DocumentProcessingError: class DocumentProcessingError extends Error {
    code = "opencv";
  },
}));

vi.mock("@/lib/ocr-image-processing", () => ({
  OcrImageError: class OcrImageError extends Error {},
  normalizeRightAngle: (rotation: number) => (rotation + 360) % 360,
  prepareOcrImage: mocks.prepareOcrImage,
}));

vi.mock("@/services/ocr-service", () => ({
  OcrServiceError: class OcrServiceError extends Error {},
  BrowserOcrSession: class BrowserOcrSession {},
  isOcrLanguagePrepared: vi.fn().mockResolvedValue(false),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Bouton introuvable : ${text}`);
  }
  return found;
}

describe("ScanFlow document adjustment", () => {
  let container: HTMLDivElement;
  let root: Root;

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
      blob: new Blob(["image"], { type: "image/jpeg" }),
      width: 1_200,
      height: 1_600,
      rotation: 0,
      mode: "original",
    });
    mocks.rectifyPage.mockResolvedValue({
      blob: new Blob(["rectified"], { type: "image/jpeg" }),
      width: 1_100,
      height: 1_500,
      mimeType: "image/jpeg",
      sourceCorners: fallbackPageCorners(),
      wasAutomaticallyDetected: false,
      mode: "original",
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("affiche les coins de secours avant la fin de la détection", async () => {
    const detection = deferred<PageDetectionResult>();
    mocks.detectPage.mockReturnValue(detection.promise);
    act(() =>
      root.render(
        <ScanFlow onPassageReady={vi.fn()} onExitToManual={vi.fn()} />,
      ),
    );
    const input = document.querySelector("#scan-library-image");
    const file = new File(["image"], "page.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Ajuster la page");
    expect(
      document.querySelectorAll('button[aria-label^="Déplacer coin"]'),
    ).toHaveLength(4);
    expect(document.body.textContent).toContain(
      "Recherche approximative des bords",
    );

    await act(async () => {
      detection.resolve({
        status: "notDetected",
        processingWidth: 900,
        processingHeight: 1_200,
        warning:
          "Les limites de la page n’ont pas été trouvées automatiquement.",
        photographWarnings: [],
      });
      await detection.promise;
    });
    expect(document.body.textContent).toContain(
      "Les limites de la page n’ont pas été trouvées",
    );
  });

  it("redresse puis affiche la comparaison avant/après", async () => {
    mocks.detectPage.mockResolvedValue({
      status: "detected",
      corners: fallbackPageCorners(),
      processingWidth: 900,
      processingHeight: 1_200,
      warning: "La page a été détectée.",
      photographWarnings: [],
    });
    act(() =>
      root.render(
        <ScanFlow onPassageReady={vi.fn()} onExitToManual={vi.fn()} />,
      ),
    );
    const input = document.querySelector("#scan-library-image");
    const file = new File(["image"], "page.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      button("Redresser la page").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.rectifyPage).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Comparer avant et après");
    expect(document.querySelector('img[alt="Page redressée"]')).toBeTruthy();
  });
});
