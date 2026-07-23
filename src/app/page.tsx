import type { Metadata } from "next";
import { BookCard } from "@/components/books/book-card";
import { EmptyLibraryState } from "@/components/books/empty-library-state";
import { Icon } from "@/components/ui/icon";
import { demoBooks } from "@/data/demo-books";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
};

export default function LibraryPage() {
  const bookCount = demoBooks.length;

  return (
    <div className="page-content">
      <header className="mb-8 pt-2">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[0.7rem] font-bold tracking-[0.18em] text-[var(--moss)] uppercase">
              BrainBook
            </p>
            <h1 className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Ma bibliothèque
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {bookCount} {bookCount > 1 ? "livres" : "livre"} dans votre collection
            </p>
          </div>

          <div
            className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]"
            aria-hidden="true"
          >
            <Icon name="bookmark" size={20} />
          </div>
        </div>

        <button
          type="button"
          className="flex min-h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--moss)] px-5 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)] active:bg-[var(--moss-dark)]"
          aria-describedby="add-book-help"
          title="L’ajout de livres arrivera à la prochaine étape"
        >
          <Icon name="plus" size={20} />
          Ajouter un livre
        </button>
        <p id="add-book-help" className="sr-only">
          Le formulaire d’ajout sera disponible lors d’une prochaine étape.
        </p>
      </header>

      <section aria-label="Recherche" className="mb-8">
        <label className="relative block">
          <span className="sr-only">Rechercher dans la bibliothèque</span>
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--muted)]">
            <Icon name="search" size={20} />
          </span>
          <input
            type="search"
            readOnly
            placeholder="Rechercher un titre ou un auteur"
            className="min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] py-3 pr-4 pl-12 text-base text-[var(--ink)] shadow-[0_2px_12px_rgb(48_39_30_/_0.035)] placeholder:text-[#969187]"
            title="La recherche sera activée prochainement"
          />
        </label>
      </section>

      <section aria-labelledby="reading-list-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-[var(--clay)] uppercase">
              En ce moment
            </p>
            <h2
              id="reading-list-title"
              className="text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]"
            >
              Vos livres
            </h2>
          </div>
          {bookCount > 0 ? (
            <span className="pb-0.5 text-xs text-[var(--muted)]">
              {bookCount} au total
            </span>
          ) : null}
        </div>

        {bookCount > 0 ? (
          <div className="grid gap-3">
            {demoBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <EmptyLibraryState />
        )}
      </section>

      <aside className="mt-8 rounded-3xl border border-[var(--line)] bg-[#eee7dc] p-5">
        <div className="flex gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-[var(--clay)]">
            <Icon name="spark" size={19} />
          </span>
          <div>
            <h2 className="font-semibold text-[var(--ink)]">Un espace à vous</h2>
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
              Vos prochaines notes de lecture seront réunies ici, livre après livre.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
