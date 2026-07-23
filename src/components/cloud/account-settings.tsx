"use client";

import { useCallback, useEffect, useState } from "react";
import { useCloudAuth } from "@/components/cloud/cloud-auth-provider";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { brainBookDatabase } from "@/storage/database";
import { syncService } from "@/sync/sync-service";

type LocalCounts = {
  books: number;
  notes: number;
};

const fieldClassName =
  "min-h-13 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] placeholder:text-[#969187]";

function formatDate(value: string | null): string {
  if (!value) return "Pas encore";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue a interrompu l’opération.";
}

export function AccountSettings() {
  const auth = useCloudAuth();
  const { status: syncStatus, refresh } = useSyncStatus();
  const [counts, setCounts] = useState<LocalCounts>({ books: 0, notes: 0 });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    const [books, notes] = await Promise.all([
      brainBookDatabase.books.count(),
      brainBookDatabase.bookNotes.count(),
    ]);
    setCounts({ books, notes });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      brainBookDatabase.books.count(),
      brainBookDatabase.bookNotes.count(),
    ]).then(([books, notes]) => {
      if (active) setCounts({ books, notes });
    });
    return () => {
      active = false;
    };
  }, []);

  const runAction = async (
    name: string,
    operation: () => Promise<unknown>,
    success?: string,
  ) => {
    if (action) return;
    setAction(name);
    setActionError(null);
    setActionSuccess(null);
    try {
      await operation();
      await Promise.all([refresh(), loadCounts()]);
      if (success) setActionSuccess(success);
    } catch (error) {
      setActionError(readableError(error));
      await refresh();
    } finally {
      setAction(null);
    }
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (action || !email.trim() || !password) return;
    await runAction("signin", async () => {
      await auth.signIn(email, password);
      setPassword("");
    });
  };

  if (auth.status === "loading") {
    return (
      <AccountCard>
        <p className="font-semibold">Ouverture de votre compte…</p>
      </AccountCard>
    );
  }

  if (auth.status === "unavailable") {
    return (
      <AccountCard>
        <div className="flex items-start gap-3">
          <AccountIcon />
          <div className="min-w-0">
            <h2 className="font-semibold">Connexion indisponible</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Ce déploiement n’est pas encore relié à votre compte BrainBook.
              Les données de cet appareil restent accessibles.
            </p>
          </div>
        </div>
      </AccountCard>
    );
  }

  if (auth.status === "disconnected") {
    return (
      <AccountCard>
        <div className="flex items-start gap-3">
          <AccountIcon />
          <div>
            <h2 className="font-semibold">Se connecter</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Retrouvez automatiquement vos livres et vos notes sur tous vos
              appareils.
            </p>
          </div>
        </div>

        {counts.books > 0 || counts.notes > 0 ? (
          <p className="rounded-2xl bg-[var(--paper-deep)] p-3 text-xs leading-5 text-[var(--muted)]">
            Les {counts.books} livre{counts.books > 1 ? "s" : ""} et{" "}
            {counts.notes} note{counts.notes > 1 ? "s" : ""} de cet appareil
            seront ajoutés à votre compte après la connexion.
          </p>
        ) : null}

        {actionError ? (
          <StatusMessage tone="error">{actionError}</StatusMessage>
        ) : null}

        <form onSubmit={handleSignIn} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="account-email"
              className="mb-2 block text-sm font-semibold"
            >
              Email
            </label>
            <input
              id="account-email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClassName}
            />
          </div>
          <div>
            <label
              htmlFor="account-password"
              className="mb-2 block text-sm font-semibold"
            >
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="account-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${fieldClassName} pr-24`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-2 min-w-20 text-xs font-semibold text-[var(--moss)]"
              >
                {showPassword ? "Masquer" : "Afficher"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={Boolean(action) || !email.trim() || !password}
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {action === "signin" ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </AccountCard>
    );
  }

  const status = getAccountStatus(
    auth.accountStatus,
    syncStatus.online,
    syncStatus.running,
    syncStatus.pendingCount,
    syncStatus.failedCount,
  );

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--muted)]">Compte connecté</p>
            <h2 className="mt-1 break-all font-semibold">{auth.email}</h2>
          </div>
          <span
            className={`shrink-0 text-right text-xs font-bold ${status.tone}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {actionSuccess ? (
        <StatusMessage tone="success">{actionSuccess}</StatusMessage>
      ) : null}
      {actionError ? (
        <StatusMessage tone="error">{actionError}</StatusMessage>
      ) : null}

      {auth.accountStatus === "preparing" ? (
        <AccountCard>
          <h3 className="font-semibold">Chargement de votre bibliothèque…</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            BrainBook rassemble automatiquement les livres et les notes de
            votre compte.
          </p>
        </AccountCard>
      ) : null}

      {auth.accountStatus === "needsMerge" && auth.accountInspection ? (
        <AccountCard>
          <h3 className="font-semibold">Rassembler vos bibliothèques</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Cet appareil contient {auth.accountInspection.localBooks} livre
            {auth.accountInspection.localBooks > 1 ? "s" : ""} et votre compte
            en contient {auth.accountInspection.remoteBooks}. Aucun livre ne
            sera supprimé.
          </p>
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={() =>
              void runAction(
                "merge",
                auth.mergeAccountData,
                "Vos bibliothèques sont maintenant réunies.",
              )
            }
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {action === "merge"
              ? "Rassemblement…"
              : "Rassembler avec mon compte"}
          </button>
        </AccountCard>
      ) : null}

      {auth.accountStatus === "accountMismatch" ? (
        <AccountCard tone="warning">
          <h3 className="font-semibold text-[var(--clay)]">
            Un autre compte était utilisé ici
          </h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Pour éviter de mélanger deux comptes, BrainBook doit retirer de cet
            appareil les données de l’ancien compte avant de charger{" "}
            <strong>{auth.email}</strong>.
          </p>
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={() => {
              if (
                window.confirm(
                  "Retirer les données de l’ancien compte de cet appareil et charger le compte actuellement connecté ?",
                )
              ) {
                void runAction(
                  "switch-account",
                  auth.useAccountOnThisDevice,
                  "Ce compte est maintenant actif sur cet appareil.",
                );
              }
            }}
            className="min-h-13 w-full rounded-2xl bg-[var(--clay)] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {action === "switch-account"
              ? "Changement de compte…"
              : "Utiliser ce compte sur cet appareil"}
          </button>
        </AccountCard>
      ) : null}

      {auth.accountStatus === "error" ? (
        <AccountCard tone="warning">
          <StatusMessage tone="error">
            {auth.accountError ?? "Impossible de charger votre compte."}
          </StatusMessage>
          <button
            type="button"
            disabled={Boolean(action) || !syncStatus.online}
            onClick={() =>
              void runAction("retry-setup", auth.retryAccountSetup)
            }
            className="min-h-12 w-full rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)] disabled:opacity-50"
          >
            {action === "retry-setup" ? "Nouvel essai…" : "Réessayer"}
          </button>
        </AccountCard>
      ) : null}

      {auth.accountStatus === "ready" ? (
        <AccountCard>
          <div className="flex items-start gap-3">
            <AccountIcon />
            <div>
              <h3 className="font-semibold">Vos données suivent votre compte</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Chaque livre et chaque note est enregistré automatiquement et
                apparaît sur vos autres appareils connectés.
              </p>
            </div>
          </div>
          <dl className="space-y-3 border-t border-[var(--line)] pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Dernière mise à jour</dt>
              <dd className="text-right font-semibold">
                {formatDate(syncStatus.lastSuccessfulSyncAt)}
              </dd>
            </div>
          </dl>
          {syncStatus.failedCount > 0 ? (
            <button
              type="button"
              disabled={Boolean(action) || !syncStatus.online}
              onClick={() =>
                auth.userId &&
                void runAction(
                  "retry-sync",
                  () => syncService.retryFailedOperations(auth.userId!),
                  "Vos données sont à jour.",
                )
              }
              className="min-h-12 w-full rounded-2xl border border-[var(--clay)] px-4 text-sm font-semibold text-[var(--clay)] disabled:opacity-50"
            >
              {action === "retry-sync" ? "Nouvel essai…" : "Réessayer"}
            </button>
          ) : null}
        </AccountCard>
      ) : null}

      <p className="px-2 text-xs leading-5 text-[var(--muted)]">
        Les photos prises pour reconnaître une page ne sont jamais ajoutées à
        votre compte.
      </p>

      <button
        type="button"
        disabled={Boolean(action)}
        onClick={() =>
          void runAction(
            "signout",
            auth.signOut,
            "Vous êtes maintenant déconnecté.",
          )
        }
        className="min-h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--clay)] disabled:opacity-50"
      >
        {action === "signout" ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </section>
  );
}

function AccountCard({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <section
      className={`mt-6 space-y-5 rounded-3xl border bg-[var(--card)] p-5 ${
        tone === "warning"
          ? "border-[var(--clay)]"
          : "border-[var(--line)]"
      }`}
    >
      {children}
    </section>
  );
}

function AccountIcon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
      <Icon name="shield" size={19} />
    </span>
  );
}

function getAccountStatus(
  accountStatus: ReturnType<typeof useCloudAuth>["accountStatus"],
  online: boolean,
  running: boolean,
  pendingCount: number,
  failedCount: number,
): { label: string; tone: string } {
  if (accountStatus === "preparing") {
    return { label: "Chargement…", tone: "text-[#8a6a2e]" };
  }
  if (accountStatus === "needsMerge" || accountStatus === "accountMismatch") {
    return { label: "Action requise", tone: "text-[#8a6a2e]" };
  }
  if (accountStatus === "error" || failedCount > 0) {
    return { label: "À vérifier", tone: "text-[var(--clay)]" };
  }
  if (!online) return { label: "Hors ligne", tone: "text-[#8a6a2e]" };
  if (running || pendingCount > 0) {
    return { label: "Mise à jour…", tone: "text-[#8a6a2e]" };
  }
  return { label: "À jour", tone: "text-[var(--moss)]" };
}
