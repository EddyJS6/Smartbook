import type { Metadata } from "next";
import { VideoCreateClient } from "@/components/books/video-create-client";

export const metadata: Metadata = {
  title: "Ajouter une vidéo",
};

export default function NewVideoPage() {
  return <VideoCreateClient />;
}
