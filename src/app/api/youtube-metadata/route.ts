import { NextRequest, NextResponse } from "next/server";
import {
  canonicalYouTubeUrl,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
} from "@/domain/youtube-video";

type OEmbedResponse = {
  title?: unknown;
};

export async function GET(request: NextRequest) {
  const submittedUrl = request.nextUrl.searchParams.get("url") ?? "";
  if (submittedUrl.length > 2_048) {
    return NextResponse.json(
      { error: "Le lien YouTube est trop long." },
      { status: 400 },
    );
  }
  const videoId = parseYouTubeVideoId(submittedUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: "Saisissez un lien vers une vidéo YouTube valide." },
      { status: 400 },
    );
  }

  const canonicalUrl = canonicalYouTubeUrl(videoId);
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            "YouTube ne permet pas de récupérer les informations de cette vidéo.",
        },
        { status: response.status === 404 ? 404 : 502 },
      );
    }
    const payload = (await response.json()) as OEmbedResponse;
    const title =
      typeof payload.title === "string"
        ? payload.title.trim().replace(/\s+/g, " ").slice(0, 500)
        : "";
    if (!title) throw new Error("Titre YouTube manquant");

    return NextResponse.json(
      {
        videoId,
        canonicalUrl,
        title,
        thumbnailUrl: youtubeThumbnailUrl(videoId),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de contacter YouTube pour le moment. Réessayez dans quelques instants.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
