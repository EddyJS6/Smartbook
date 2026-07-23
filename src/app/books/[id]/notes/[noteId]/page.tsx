import type { Metadata } from "next";
import { NoteDetailClient } from "@/components/notes/note-detail-client";

export const metadata: Metadata = {
  title: "Note de lecture",
};

export default function NoteDetailPage() {
  return <NoteDetailClient />;
}
