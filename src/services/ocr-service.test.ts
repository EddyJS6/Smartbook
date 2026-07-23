// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserOcrSession } from "@/services/ocr-service";

const mocks = vi.hoisted(() => {
  const recognize = vi.fn();
  const terminate = vi.fn().mockResolvedValue({});
  const createWorker = vi.fn().mockResolvedValue({
    recognize,
    terminate,
  });
  return { recognize, terminate, createWorker };
});

vi.mock("tesseract.js", () => ({
  createWorker: mocks.createWorker,
  OEM: { LSTM_ONLY: 1 },
}));

const recognizedPage = {
  data: {
    text: "Texte reconnu",
    confidence: 88,
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                text: "Texte reconnu",
                words: [
                  {
                    text: "Texte",
                    confidence: 90,
                    bbox: { x0: 1, y0: 2, x1: 30, y1: 20 },
                  },
                  {
                    text: "reconnu",
                    confidence: 86,
                    bbox: { x0: 35, y0: 2, x1: 80, y1: 20 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("BrowserOcrSession", () => {
  beforeEach(() => {
    mocks.recognize.mockReset().mockResolvedValue(recognizedPage);
    mocks.terminate.mockClear();
    mocks.createWorker.mockClear();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charge dynamiquement un worker unique et demande explicitement les blocs", async () => {
    const progress = vi.fn();
    const session = new BrowserOcrSession(progress);
    const image = new Blob(["image"], { type: "image/jpeg" });

    const first = await session.recognize(image, "fra", {
      width: 1200,
      height: 1800,
    });
    await session.recognize(image, "fra", {
      width: 1200,
      height: 1800,
    });

    expect(mocks.createWorker).toHaveBeenCalledTimes(1);
    expect(mocks.createWorker).toHaveBeenCalledWith(
      "fra",
      1,
      expect.objectContaining({
        logger: expect.any(Function),
        errorHandler: expect.any(Function),
      }),
    );
    expect(mocks.recognize).toHaveBeenCalledWith(
      image,
      {},
      { text: true, blocks: true },
    );
    expect(first.words.map((word) => word.text)).toEqual(["Texte", "reconnu"]);

    await session.terminate();
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });

  it("refuse un premier chargement hors ligne sans perdre l’image", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const session = new BrowserOcrSession(vi.fn());

    await expect(
      session.recognize(new Blob(["photo"]), "pol", {
        width: 1000,
        height: 1500,
      }),
    ).rejects.toMatchObject({ code: "offline_model_missing" });
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });

  it("ignore le résultat tardif après annulation et termine le worker", async () => {
    let resolveRecognition:
      | ((value: typeof recognizedPage) => void)
      | undefined;
    mocks.recognize.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecognition = resolve;
        }),
    );
    const session = new BrowserOcrSession(vi.fn());
    const recognition = session.recognize(new Blob(["photo"]), "eng", {
      width: 1000,
      height: 1500,
    });

    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    await session.cancel();
    resolveRecognition?.(recognizedPage);

    await expect(recognition).rejects.toMatchObject({ code: "cancelled" });
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });
});
