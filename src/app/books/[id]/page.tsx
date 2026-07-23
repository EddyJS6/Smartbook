import type { Metadata } from "next";
import { BookDetailClient } from "@/components/books/book-detail-client";

export const metadata: Metadata = {
  title: "Fiche du livre",
};

export default function BookDetailPage() {
  return <BookDetailClient />;
}
