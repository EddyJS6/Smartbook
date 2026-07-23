import type { Metadata } from "next";
import { IdeasClient } from "@/components/notes/ideas-client";

export const metadata: Metadata = {
  title: "Mes idées",
};

export default function IdeasPage() {
  return <IdeasClient />;
}
