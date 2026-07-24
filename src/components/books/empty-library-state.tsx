import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function EmptyLibraryState() {
  return (
    <div className="rounded-[2rem] border border-dashed border-[#d6cdbf] bg-[var(--card)] px-6 py-10 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
        <Icon name="book" size={25} />
      </span>
      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">
        Votre bibliothèque commence ici
      </h3>
      <p className="balance mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
        Vos livres et vidéos apparaîtront ici, prêts à accueillir vos notes.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          href="/books/new"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
        >
          Un livre
        </Link>
        <Link
          href="/videos/new"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
        >
          Une vidéo
        </Link>
      </div>
    </div>
  );
}
