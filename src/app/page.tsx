import type { Metadata } from "next";
import { LibraryClient } from "@/components/books/library-client";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
};

export default function LibraryPage() {
  return <LibraryClient />;
}
