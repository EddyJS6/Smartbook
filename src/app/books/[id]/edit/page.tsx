import type { Metadata } from "next";
import { BookEditClient } from "@/components/books/book-edit-client";

export const metadata: Metadata = {
  title: "Modifier un livre",
};

export default function EditBookPage() {
  return <BookEditClient />;
}
