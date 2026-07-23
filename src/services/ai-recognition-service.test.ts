// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiRecognitionError,
  recognizePageWithAi,
} from "@/services/ai-recognition-service";

describe("recognizePageWithAi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("transmet la page préparée à la route locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        text: "Texte reconnu",
        model: "gpt-5.4-mini",
        processingDurationMs: 1200,
        usage: {
          inputTokens: 100,
          outputTokens: 20,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await recognizePageWithAi(
      new Blob(["image"], { type: "image/jpeg" }),
      "fra",
    );

    expect(result.text).toBe("Texte reconnu");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ocr",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });

  it("refuse immédiatement la reconnaissance hors ligne", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      recognizePageWithAi(
        new Blob(["image"], { type: "image/jpeg" }),
        "fra",
      ),
    ).rejects.toMatchObject({
      code: "offline",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("conserve le message serveur lorsque la configuration manque", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: "La clé OpenAI manque sur Vercel." },
          { status: 503 },
        ),
      ),
    );

    await expect(
      recognizePageWithAi(
        new Blob(["image"], { type: "image/jpeg" }),
        "eng",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AiRecognitionError>>({
        code: "not_configured",
        message: "La clé OpenAI manque sur Vercel.",
      }),
    );
  });
});
