import type { Metadata } from "next";
import { BookForm } from "@/components/books/book-form";

export const metadata: Metadata = {
  title: "Ajouter un livre",
};

export default function NewBookPage() {
  return <BookForm mode="create" />;
}
