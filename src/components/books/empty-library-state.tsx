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
        Les livres que vous ajouterez apparaîtront ici, prêts à accueillir vos notes.
      </p>
      <Link
        href="/books/new"
        className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
      >
        <Icon name="plus" size={18} />
        Ajouter mon premier livre
      </Link>
    </div>
  );
}
