import type { Book } from "@/domain/models";

export type DemoBook = Book & {
  noteCount: number;
  coverImage: NonNullable<Book["coverImage"]>;
};

/**
 * Données de démonstration temporaires.
 * Supprimer ce tableau lorsque le dépôt IndexedDB sera branché.
 */
export const demoBooks: readonly DemoBook[] = [
  {
    id: "f541d4d3-7844-42c0-8a97-6a8f8d3a0d11",
    title: "L’Art de la simplicité",
    author: "Dominique Loreau",
    coverImage: {
      kind: "local",
      uri: "/covers/art-simplicite.svg",
      mimeType: "image/svg+xml",
    },
    status: "reading",
    noteCount: 8,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-20T18:30:00.000Z",
  },
  {
    id: "68e53a30-bddb-4936-b4f4-b082de4df52e",
    title: "Siddhartha",
    author: "Hermann Hesse",
    coverImage: {
      kind: "local",
      uri: "/covers/siddhartha.svg",
      mimeType: "image/svg+xml",
    },
    status: "read",
    noteCount: 12,
    createdAt: "2026-06-12T11:45:00.000Z",
    updatedAt: "2026-07-16T07:20:00.000Z",
  },
  {
    id: "c7df81b3-c258-4dbf-a6fa-5102168a1be6",
    title: "Une chambre à soi",
    author: "Virginia Woolf",
    coverImage: {
      kind: "local",
      uri: "/covers/une-chambre-a-soi.svg",
      mimeType: "image/svg+xml",
    },
    status: "to_read",
    noteCount: 0,
    createdAt: "2026-07-18T16:10:00.000Z",
    updatedAt: "2026-07-18T16:10:00.000Z",
  },
];
