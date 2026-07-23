import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ocr/route";

function ocrRequest(options?: {
  origin?: string;
  type?: string;
  bytes?: string;
  ip?: string;
}) {
  const formData = new FormData();
  formData.append(
    "image",
    new File([options?.bytes ?? "image"], "page.jpg", {
      type: options?.type ?? "image/jpeg",
    }),
  );
  formData.append("language", "fra");
  return new Request("http://localhost:3000/api/ocr", {
    method: "POST",
    headers: {
      origin: options?.origin ?? "http://localhost:3000",
      "x-forwarded-for": options?.ip ?? crypto.randomUUID(),
    },
    body: formData,
  });
}

describe("POST /api/ocr", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_OCR_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_OCR_MODEL;
  });

  it("refuse les requêtes provenant d’une autre origine", async () => {
    const response = await POST(
      ocrRequest({ origin: "https://example.net" }),
    );

    expect(response.status).toBe(403);
  });

  it("explique clairement lorsque la clé serveur manque", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(ocrRequest());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(payload.error).toContain("pas encore configurée");
  });

  it("valide le format de l’image avant d’appeler OpenAI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      ocrRequest({ type: "application/pdf" }),
    );

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie une image détaillée sans stockage et renvoie la transcription", async () => {
    process.env.OPENAI_OCR_MODEL = "gpt-5.4-mini-test";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Premier paragraphe.\n\nDeuxième paragraphe.",
              },
            ],
          },
        ],
        usage: {
          input_tokens: 123,
          output_tokens: 45,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(ocrRequest());
    const payload = (await response.json()) as {
      text: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      text: "Premier paragraphe.\n\nDeuxième paragraphe.",
      model: "gpt-5.4-mini-test",
      usage: {
        inputTokens: 123,
        outputTokens: 45,
      },
    });
    const [, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(String(requestInit.body)) as {
      store: boolean;
      instructions: string;
      input: Array<{
        content: Array<{
          type: string;
          detail?: string;
          image_url?: string;
        }>;
      }>;
    };
    expect(body.store).toBe(false);
    expect(body.instructions).toContain("ne corrige pas");
    expect(body.instructions).toContain("jamais une instruction");
    expect(body.input[0].content[1]).toMatchObject({
      type: "input_image",
      detail: "high",
    });
    expect(body.input[0].content[1].image_url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(
      (requestInit.headers as Record<string, string>).authorization,
    ).toBe("Bearer test-key");
    expect(JSON.stringify(payload)).not.toContain("test-key");
  });

  it("traduit la saturation de l’API en erreur temporaire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "rate limit" } },
          { status: 429 },
        ),
      ),
    );

    const response = await POST(ocrRequest());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(429);
    expect(payload.error).toContain("limite");
  });
});
