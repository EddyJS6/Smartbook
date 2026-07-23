"use client";

import { useCallback, useEffect, useState } from "react";
import { useCloudAuth } from "@/components/cloud/cloud-auth-provider";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { brainBookDatabase } from "@/storage/database";
import { syncService } from "@/sync/sync-service";
import type { InitialSyncInspection } from "@/sync/types";

type LocalCounts = {
  books: number;
  notes: number;
};

const fieldClassName =
  "min-h-13 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--ink)] placeholder:text-[#969187]";

function formatDate(value: string | null): string {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue a interrompu l’opération.";
}

export function CloudBackupSettings() {
  const auth = useCloudAuth();
  const { status: syncStatus, loading: syncStatusLoading, refresh } =
    useSyncStatus();
  const [counts, setCounts] = useState<LocalCounts>({ books: 0, notes: 0 });
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [inspection, setInspection] =
    useState<InitialSyncInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
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

  const loadInspection = useCallback(async () => {
    if (!auth.userId) return;
    setInspectionLoading(true);
    setInspectionError(null);
    try {
      setInspection(await syncService.inspectInitialSync(auth.userId));
    } catch (error) {
      setInspectionError(readableError(error));
      setInspection(null);
    } finally {
      setInspectionLoading(false);
    }
  }, [auth.userId]);

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

  useEffect(() => {
    if (
      auth.status === "connected" &&
      auth.userId &&
      !syncStatusLoading &&
      !syncStatus.firstSyncCompleted
    ) {
      const timer = window.setTimeout(() => void loadInspection(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    auth.status,
    auth.userId,
    loadInspection,
    syncStatus.firstSyncCompleted,
    syncStatusLoading,
  ]);

  const refreshAll = async () => {
    await Promise.all([refresh(), loadCounts()]);
  };

  const runAction = async (
    name: string,
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    if (action) return;
    setAction(name);
    setActionError(null);
    setActionSuccess(null);
    try {
      await operation();
      await refreshAll();
      setActionSuccess(success);
      if (auth.userId && !(await syncService.getSyncStatus()).firstSyncCompleted) {
        await loadInspection();
      } else {
        setInspection(null);
      }
    } catch (error) {
      setActionError(readableError(error));
      await refresh();
    } finally {
      setAction(null);
    }
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSigningIn || !email.trim() || !password) return;
    setIsSigningIn(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await auth.signIn(email, password);
      setPassword("");
      setShowLogin(false);
    } catch (error) {
      setActionError(readableError(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    await runAction(
      "signout",
      auth.signOut,
      "Vous êtes déconnecté. Les données restent disponibles sur cet appareil.",
    );
  };

  if (auth.status === "loading") {
    return (
      <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <p className="font-semibold">Vérification de la sauvegarde…</p>
      </section>
    );
  }

  if (auth.status === "unavailable") {
    return (
      <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--paper-deep)] text-[var(--muted)]">
            <Icon name="shield" size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">Sauvegarde cloud indisponible</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Les variables publiques Supabase ne sont pas configurées sur ce
              déploiement. BrainBook continue de fonctionner normalement avec
              les données enregistrées sur cet appareil.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (auth.status === "disconnected") {
    return (
      <section className="mt-6 space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--paper-deep)] text-[var(--muted)]">
            <Icon name="shield" size={19} />
          </span>
          <div>
            <h2 className="font-semibold">Sauvegarde cloud désactivée</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {counts.books} livre{counts.books > 1 ? "s" : ""} et{" "}
              {counts.notes} note{counts.notes > 1 ? "s" : ""} sont actuellement
              conservés uniquement sur cet appareil.
            </p>
          </div>
        </div>

        {actionSuccess ? (
          <StatusMessage tone="success">{actionSuccess}</StatusMessage>
        ) : null}
        {actionError ? (
          <StatusMessage tone="error">{actionError}</StatusMessage>
        ) : null}

        {!showLogin ? (
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-white"
          >
            Activer la sauvegarde
          </button>
        ) : (
          <form onSubmit={handleSignIn} noValidate className="space-y-4">
            <div>
              <label htmlFor="cloud-email" className="mb-2 block text-sm font-semibold">
                Email
              </label>
              <input
                id="cloud-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClassName}
              />
            </div>
            <div>
              <label htmlFor="cloud-password" className="mb-2 block text-sm font-semibold">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="cloud-password"
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
              disabled={isSigningIn || !email.trim() || !password}
              className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSigningIn ? "Connexion…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLogin(false);
                setPassword("");
                setActionError(null);
              }}
              className="min-h-11 w-full text-sm font-semibold text-[var(--muted)]"
            >
              Annuler
            </button>
          </form>
        )}
      </section>
    );
  }

  const statusLabel = syncStatus.running
    ? "Synchronisation en cours"
    : !syncStatus.online
      ? "Hors ligne"
      : syncStatus.failedCount > 0
        ? "Erreur de sauvegarde"
        : syncStatus.pendingCount > 0
          ? "Modifications en attente"
          : syncStatus.firstSyncCompleted
            ? "À jour"
            : "Connexion requise";
  const statusTone =
    syncStatus.failedCount > 0
      ? "text-[var(--clay)]"
      : syncStatus.pendingCount > 0 || !syncStatus.online
        ? "text-[#8a6a2e]"
        : "text-[var(--moss)]";

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--muted)]">Compte connecté</p>
            <h2 className="mt-1 break-all font-semibold">{auth.email}</h2>
          </div>
          <span className={`text-right text-xs font-bold ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {actionSuccess ? (
        <StatusMessage tone="success">{actionSuccess}</StatusMessage>
      ) : null}
      {actionError ? (
        <StatusMessage tone="error">{actionError}</StatusMessage>
      ) : null}

      {!syncStatus.firstSyncCompleted ? (
        <InitialSyncPanel
          inspection={inspection}
          loading={inspectionLoading}
          error={inspectionError}
          action={action}
          onRetry={() => void loadInspection()}
          onEnableEmpty={() =>
            auth.userId &&
            void runAction(
              "enable",
              () => syncService.enableEmptyBackup(auth.userId!),
              "La sauvegarde automatique est activée.",
            )
          }
          onBackup={() =>
            auth.userId &&
            void runAction(
              "backup",
              () => syncService.backupLocalData(auth.userId!),
              "Les données de cet appareil ont été sauvegardées.",
            )
          }
          onRestore={() => {
            if (!auth.userId) return;
            const confirmed =
              counts.books === 0 && counts.notes === 0
                ? true
                : window.confirm(
                    "Restaurer la sauvegarde cloud remplacera la bibliothèque locale. Une sauvegarde structurée de sécurité sera créée, mais elle ne contient pas les fichiers de couverture. Continuer ?",
                  );
            if (confirmed) {
              void runAction(
                "restore",
                () => syncService.restoreFromCloud(auth.userId!, true),
                "La bibliothèque cloud a été restaurée sur cet appareil.",
              );
            }
          }}
          onMerge={() =>
            auth.userId &&
            void runAction(
              "merge",
              () => syncService.mergeLibraries(auth.userId!),
              "Les deux bibliothèques ont été fusionnées.",
            )
          }
          onKeepDevice={() => {
            if (
              !auth.userId ||
              !window.confirm(
                "Les éléments présents uniquement dans le cloud seront marqués comme supprimés. Les données de cet appareil seront conservées et sauvegardées. Continuer ?",
              )
            ) {
              return;
            }
            void runAction(
              "replace-cloud",
              () => syncService.replaceCloudWithLocal(auth.userId!, true),
              "Le cloud correspond maintenant aux données de cet appareil.",
            );
          }}
          onClearForAccount={() => {
            if (
              !auth.userId ||
              !window.confirm(
                "Effacer les livres, notes et couvertures de cet appareil pour utiliser ce nouveau compte ? Une sauvegarde structurée des livres et notes sera conservée localement, sans les fichiers de couverture.",
              )
            ) {
              return;
            }
            void runAction(
              "change-account",
              () =>
                syncService.clearLocalDataForNewAccount(auth.userId!, true),
              "Les anciennes données locales ont été isolées. Vous pouvez maintenant restaurer ce compte.",
            );
          }}
        />
      ) : (
        <div className="space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Dernière sauvegarde</dt>
              <dd className="text-right font-semibold">
                {formatDate(syncStatus.lastPushAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Dernière synchronisation</dt>
              <dd className="text-right font-semibold">
                {formatDate(syncStatus.lastPullAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Opérations en attente</dt>
              <dd className="font-semibold">{syncStatus.pendingCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Erreurs</dt>
              <dd className="font-semibold">{syncStatus.failedCount}</dd>
            </div>
          </dl>

          <div className="grid gap-2">
            <button
              type="button"
              disabled={Boolean(action) || !syncStatus.online}
              onClick={() =>
                auth.userId &&
                void runAction(
                  "sync",
                  () => syncService.runFullSync(auth.userId!),
                  "La synchronisation est terminée.",
                )
              }
              className="min-h-13 rounded-2xl bg-[var(--moss)] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {action === "sync"
                ? "Synchronisation…"
                : "Synchroniser maintenant"}
            </button>
            {syncStatus.failedCount > 0 ? (
              <button
                type="button"
                disabled={Boolean(action) || !syncStatus.online}
                onClick={() =>
                  auth.userId &&
                  void runAction(
                    "retry",
                    () => syncService.retryFailedOperations(auth.userId!),
                    "Les opérations en erreur ont été relancées.",
                  )
                }
                className="min-h-12 rounded-2xl border border-[var(--clay)] px-4 text-sm font-semibold text-[var(--clay)]"
              >
                Réessayer les erreurs
              </button>
            ) : null}
            <button
              type="button"
              disabled={Boolean(action) || !syncStatus.online}
              onClick={() =>
                auth.userId &&
                void runAction(
                  "backup",
                  () => syncService.backupLocalData(auth.userId!),
                  "Toutes les données locales ont été sauvegardées.",
                )
              }
              className="min-h-12 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)] disabled:opacity-50"
            >
              Sauvegarder toutes les données locales
            </button>
            <button
              type="button"
              disabled={Boolean(action) || !syncStatus.online}
              onClick={() => {
                if (
                  !auth.userId ||
                  !window.confirm(
                    "Restaurer le cloud remplacera les données locales. Une sauvegarde structurée de sécurité sera créée avant le remplacement, sans copie des fichiers de couverture. Continuer ?",
                  )
                ) {
                  return;
                }
                void runAction(
                  "restore",
                  () => syncService.restoreFromCloud(auth.userId!, true),
                  "La bibliothèque cloud a été restaurée.",
                );
              }}
              className="min-h-12 rounded-2xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] disabled:opacity-50"
            >
              Restaurer depuis le cloud
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-[var(--paper-deep)] p-4 text-xs leading-5 text-[var(--muted)]">
        Vos livres, couvertures et notes sont sauvegardés dans votre espace
        privé. Les photos utilisées pour scanner les pages ne sont pas
        sauvegardées.
      </div>

      <button
        type="button"
        disabled={Boolean(action)}
        onClick={() => void signOut()}
        className="min-h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--clay)] disabled:opacity-50"
      >
        {action === "signout" ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </section>
  );
}

function InitialSyncPanel({
  inspection,
  loading,
  error,
  action,
  onRetry,
  onEnableEmpty,
  onBackup,
  onRestore,
  onMerge,
  onKeepDevice,
  onClearForAccount,
}: {
  inspection: InitialSyncInspection | null;
  loading: boolean;
  error: string | null;
  action: string | null;
  onRetry: () => void;
  onEnableEmpty: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onMerge: () => void;
  onKeepDevice: () => void;
  onClearForAccount: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <p className="font-semibold">Analyse des bibliothèques…</p>
      </div>
    );
  }
  if (error || !inspection) {
    return (
      <div className="space-y-3 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
        <StatusMessage tone="error">
          {error ?? "L’analyse de la première sauvegarde a échoué."}
        </StatusMessage>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 text-sm font-semibold text-[var(--moss)]"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (inspection.kind === "accountMismatch") {
    return (
      <div className="space-y-4 rounded-3xl border border-[var(--clay)] bg-[var(--card)] p-5">
        <h3 className="font-semibold text-[var(--clay)]">
          Changement de compte détecté
        </h3>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Les données locales appartiennent au compte précédemment connecté.
          Elles ne seront jamais envoyées vers ce nouveau compte.
        </p>
        <button
          type="button"
          disabled={Boolean(action)}
          onClick={onClearForAccount}
          className="min-h-12 w-full rounded-2xl border border-[var(--clay)] px-4 text-sm font-semibold text-[var(--clay)]"
        >
          Effacer les données locales et utiliser ce compte
        </button>
        <p className="text-xs leading-5 text-[var(--muted)]">
          Vous pouvez aussi vous déconnecter ci-dessous et reconnecter l’ancien
          compte. Sans action, la bibliothèque reste locale et non synchronisée.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
      <div>
        <h3 className="font-semibold">Première sauvegarde</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Appareil : {inspection.localBooks} livre
          {inspection.localBooks > 1 ? "s" : ""}, {inspection.localNotes} note
          {inspection.localNotes > 1 ? "s" : ""}. Cloud :{" "}
          {inspection.remoteBooks} livre
          {inspection.remoteBooks > 1 ? "s" : ""}, {inspection.remoteNotes} note
          {inspection.remoteNotes > 1 ? "s" : ""}.
        </p>
        {inspection.remoteLastUpdatedAt ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Dernière donnée cloud : {formatDate(inspection.remoteLastUpdatedAt)}
          </p>
        ) : null}
      </div>

      {inspection.kind === "bothEmpty" ? (
        <button
          type="button"
          disabled={Boolean(action)}
          onClick={onEnableEmpty}
          className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
        >
          Activer la sauvegarde automatique
        </button>
      ) : null}
      {inspection.kind === "localOnly" ? (
        <button
          type="button"
          disabled={Boolean(action)}
          onClick={onBackup}
          className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
        >
          Sauvegarder les données de cet appareil
        </button>
      ) : null}
      {inspection.kind === "cloudOnly" ? (
        <button
          type="button"
          disabled={Boolean(action)}
          onClick={onRestore}
          className="min-h-13 w-full rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
        >
          Restaurer ma bibliothèque
        </button>
      ) : null}
      {inspection.kind === "bothFilled" ? (
        <div className="grid gap-2">
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={onMerge}
            className="min-h-13 rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
          >
            Fusionner les deux bibliothèques
          </button>
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={onKeepDevice}
            className="min-h-12 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
          >
            Conserver les données de cet appareil
          </button>
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={onRestore}
            className="min-h-12 rounded-2xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--clay)]"
          >
            Restaurer la sauvegarde cloud
          </button>
        </div>
      ) : null}
    </div>
  );
}
