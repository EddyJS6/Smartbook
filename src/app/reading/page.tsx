import type { Metadata } from "next";
import { Suspense } from "react";
import { ReadingClient } from "@/components/reading/reading-client";

export const metadata: Metadata = {
  title: "Mode lecture",
};

export default function ReadingPage() {
  return (
    <Suspense
      fallback={
        <div className="page-content">
          <div className="h-96 animate-pulse rounded-3xl bg-[var(--card)]" />
        </div>
      }
    >
      <ReadingClient />
    </Suspense>
  );
}
