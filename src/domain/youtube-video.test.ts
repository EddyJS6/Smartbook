import { describe, expect, it } from "vitest";
import {
  canonicalYouTubeUrl,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
} from "@/domain/youtube-video";

describe("YouTube video links", () => {
  it.each([
    ["https://www.youtube.com/watch?v=M7lc1UVf-VE", "M7lc1UVf-VE"],
    ["https://youtu.be/M7lc1UVf-VE?t=12", "M7lc1UVf-VE"],
    ["https://www.youtube.com/shorts/M7lc1UVf-VE", "M7lc1UVf-VE"],
    ["https://www.youtube.com/embed/M7lc1UVf-VE", "M7lc1UVf-VE"],
  ])("extrait l’identifiant de %s", (url, expected) => {
    expect(parseYouTubeVideoId(url)).toBe(expected);
  });

  it("refuse les domaines ressemblants et les identifiants invalides", () => {
    expect(
      parseYouTubeVideoId(
        "https://youtube.com.example.test/watch?v=M7lc1UVf-VE",
      ),
    ).toBeNull();
    expect(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=invalid"),
    ).toBeNull();
  });

  it("construit des URL canoniques déterministes", () => {
    expect(canonicalYouTubeUrl("M7lc1UVf-VE")).toBe(
      "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    );
    expect(youtubeThumbnailUrl("M7lc1UVf-VE")).toBe(
      "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    );
  });
});
