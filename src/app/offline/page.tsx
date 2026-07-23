import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Hors ligne",
};

export default function OfflinePage() {
  return (
    <div className="page-content flex items-center">
      <section className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-7 text-center shadow-[0_10px_35px_rgb(48_39_30_/_0.06)]">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
          <Icon name="book" size={25} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
          Vous êtes hors ligne
        </h1>
        <p className="balance mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
          BrainBook prépare vos lectures pour rester près de vous, même sans réseau.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-6 py-3 text-sm font-semibold text-white"
        >
          Réessayer
        </Link>
      </section>
    </div>
  );
}
