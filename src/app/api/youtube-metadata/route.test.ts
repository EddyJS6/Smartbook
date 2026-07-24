import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/youtube-metadata/route";

describe("GET /api/youtube-metadata", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuse un lien non YouTube avant tout appel externe", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      new NextRequest(
        "https://brainbook.test/api/youtube-metadata?url=https%3A%2F%2Fexample.com",
      ),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renvoie le titre et une miniature canonique", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Une vidéo utile" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const response = await GET(
      new NextRequest(
        "https://brainbook.test/api/youtube-metadata?url=https%3A%2F%2Fyoutu.be%2FM7lc1UVf-VE",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      videoId: "M7lc1UVf-VE",
      title: "Une vidéo utile",
      thumbnailUrl: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    });
  });
});
