import type { Metadata } from "next";
import { CloudBackupSettings } from "@/components/cloud/cloud-backup-settings";

export const metadata: Metadata = {
  title: "Réglages",
};

export default function SettingsPage() {
  return (
    <div className="page-content">
      <header className="pt-1">
        <p className="text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
          Votre espace
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
          Réglages
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Gérez la sauvegarde privée de votre bibliothèque.
        </p>
      </header>
      <CloudBackupSettings />
    </div>
  );
}
