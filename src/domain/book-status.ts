import type { BookStatus } from "@/domain/models";

export const bookStatusLabels: Record<BookStatus, string> = {
  to_read: "À lire",
  reading: "En cours",
  finished: "Terminé",
};

export const bookStatusOptions: ReadonlyArray<{
  value: BookStatus;
  label: string;
}> = [
  { value: "to_read", label: bookStatusLabels.to_read },
  { value: "reading", label: bookStatusLabels.reading },
  { value: "finished", label: bookStatusLabels.finished },
];
