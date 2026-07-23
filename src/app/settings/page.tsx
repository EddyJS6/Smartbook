import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = {
  title: "Réglages",
};

export default function SettingsPage() {
  return (
    <ComingSoon
      eyebrow="Votre espace"
      title="Réglages"
      description="Les préférences de lecture, la sauvegarde et la synchronisation seront ajoutées progressivement."
      icon="settings"
    />
  );
}
