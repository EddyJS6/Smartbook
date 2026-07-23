import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = {
  title: "Idées",
};

export default function IdeasPage() {
  return (
    <ComingSoon
      eyebrow="Vos inspirations"
      title="Idées"
      description="Les passages marquants et vos réflexions personnelles se retrouveront bientôt ici."
      icon="spark"
    />
  );
}
