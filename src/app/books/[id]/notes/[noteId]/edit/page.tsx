import type { Metadata } from "next";
import { NoteEditClient } from "@/components/notes/note-edit-client";

export const metadata: Metadata = {
  title: "Modifier une note",
};

export default function EditNotePage() {
  return <NoteEditClient />;
}
