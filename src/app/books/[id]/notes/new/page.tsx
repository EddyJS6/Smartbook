import type { Metadata } from "next";
import { NoteCreateClient } from "@/components/notes/note-create-client";

export const metadata: Metadata = {
  title: "Ajouter une note",
};

export default function NewNotePage() {
  return <NoteCreateClient />;
}
