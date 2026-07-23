"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { UUID } from "@/domain/models";
import {
  getSupabaseClient,
  supabaseConfiguration,
} from "@/lib/supabase/client";
import { syncService } from "@/sync/sync-service";
import type { InitialSyncInspection } from "@/sync/types";

type CloudAuthStatus =
  | "unavailable"
  | "loading"
  | "disconnected"
  | "connected";

type AccountStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "needsMerge"
  | "accountMismatch"
  | "error";

type CloudAuthContextValue = {
  status: CloudAuthStatus;
  configured: boolean;
  configurationMessage: string | null;
  session: Session | null;
  userId: UUID | null;
  email: string | null;
  accountStatus: AccountStatus;
  accountInspection: InitialSyncInspection | null;
  accountError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryAccountSetup: () => Promise<void>;
  mergeAccountData: () => Promise<void>;
  useAccountOnThisDevice: () => Promise<void>;
};

const CloudAuthContext = createContext<CloudAuthContextValue | null>(null);

function translateAuthError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (/invalid login credentials/i.test(message)) {
    return "Email ou mot de passe incorrect.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirmez d’abord l’adresse email depuis Supabase.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }
  if (/fetch|network/i.test(message)) {
    return "Connexion au compte impossible. Vérifiez Internet.";
  }
  return "La connexion a échoué. Vérifiez vos identifiants.";
}

function readableAccountError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Impossible de charger les données de votre compte.";
}

export function CloudAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudAuthStatus>(
    supabaseConfiguration.configured ? "loading" : "unavailable",
  );
  const [accountStatus, setAccountStatus] =
    useState<AccountStatus>("idle");
  const [accountInspection, setAccountInspection] =
    useState<InitialSyncInspection | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const setupPromiseRef = useRef<Promise<void> | null>(null);
  const setupUserIdRef = useRef<UUID | null>(null);
  const activeUserIdRef = useRef<UUID | null>(null);

  useEffect(() => {
    activeUserIdRef.current =
      (session?.user.id as UUID | undefined) ?? null;
  }, [session]);

  useEffect(() => {
    if (!supabaseConfiguration.configured) return;
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setSession(null);
        setStatus("disconnected");
        return;
      }
      setSession(data.session);
      setStatus(data.session ? "connected" : "disconnected");
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? "connected" : "disconnected");
      if (!nextSession) {
        syncService.cancelCurrentSync();
        setAccountStatus("idle");
        setAccountInspection(null);
        setAccountError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const prepareAccount = useCallback(async (userId: UUID) => {
    if (
      setupPromiseRef.current &&
      setupUserIdRef.current === userId
    ) {
      return setupPromiseRef.current;
    }
    if (setupPromiseRef.current) {
      await setupPromiseRef.current.catch(() => undefined);
    }

    setAccountStatus("preparing");
    setAccountInspection(null);
    setAccountError(null);
    const run = syncService
      .initializeAccount(userId)
      .then((result) => {
        if (activeUserIdRef.current !== userId) return;
        if (result.status === "ready") {
          setAccountStatus("ready");
          return;
        }
        setAccountInspection(result.inspection);
        setAccountStatus(result.status);
      })
      .catch((error: unknown) => {
        if (activeUserIdRef.current !== userId) return;
        setAccountError(readableAccountError(error));
        setAccountStatus("error");
      })
      .finally(() => {
        if (setupPromiseRef.current === run) {
          setupPromiseRef.current = null;
          setupUserIdRef.current = null;
        }
      });
    setupPromiseRef.current = run;
    setupUserIdRef.current = userId;
    await run;
  }, []);

  useEffect(() => {
    const userId = session?.user.id as UUID | undefined;
    if (status !== "connected" || !userId) return;
    void prepareAccount(userId);
  }, [prepareAccount, session, status]);

  useEffect(() => {
    const userId = session?.user.id as UUID | undefined;
    if (
      status !== "connected" ||
      accountStatus !== "ready" ||
      !userId
    ) {
      return;
    }

    const scheduleSync = (delay = 1_500) => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void syncService
          .getSyncStatus()
          .then((syncStatus) => {
            if (
              syncStatus.firstSyncCompleted &&
              syncStatus.associatedUserId === userId &&
              navigator.onLine
            ) {
              return syncService.runFullSync(userId);
            }
          })
          .catch(() => {
            // Les erreurs restent visibles dans la queue et dans Réglages.
          });
      }, delay);
    };

    const handleOnline = () => scheduleSync(300);
    const handleMutation = () => scheduleSync();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleSync(500);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("brainbook:local-mutation", handleMutation);
    document.addEventListener("visibilitychange", handleVisibility);
    scheduleSync(800);

    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("brainbook:local-mutation", handleMutation);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [accountStatus, session, status]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("La sauvegarde Supabase n’est pas configurée.");
    }
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(translateAuthError(error), { cause: error });
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    syncService.cancelCurrentSync();
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) {
      throw new Error("La déconnexion a échoué. Réessayez.", {
        cause: error,
      });
    }
  }, []);

  const retryAccountSetup = useCallback(async () => {
    const userId = activeUserIdRef.current;
    if (!userId) {
      throw new Error("Reconnectez-vous pour charger votre compte.");
    }
    await prepareAccount(userId);
  }, [prepareAccount]);

  const mergeAccountData = useCallback(async () => {
    const userId = activeUserIdRef.current;
    if (!userId) {
      throw new Error("Reconnectez-vous pour charger votre compte.");
    }
    setAccountStatus("preparing");
    setAccountError(null);
    try {
      await syncService.mergeLibraries(userId);
      if (activeUserIdRef.current === userId) {
        setAccountInspection(null);
        setAccountStatus("ready");
      }
    } catch (error) {
      if (activeUserIdRef.current === userId) {
        setAccountError(readableAccountError(error));
        setAccountStatus("error");
      }
      throw error;
    }
  }, []);

  const useAccountOnThisDevice = useCallback(async () => {
    const userId = activeUserIdRef.current;
    if (!userId) {
      throw new Error("Reconnectez-vous pour charger votre compte.");
    }
    setAccountStatus("preparing");
    setAccountError(null);
    try {
      await syncService.clearLocalDataForNewAccount(userId, true);
      const result = await syncService.initializeAccount(userId);
      if (activeUserIdRef.current !== userId) return;
      if (result.status === "ready") {
        setAccountInspection(null);
        setAccountStatus("ready");
      } else {
        setAccountInspection(result.inspection);
        setAccountStatus(result.status);
      }
    } catch (error) {
      if (activeUserIdRef.current === userId) {
        setAccountError(readableAccountError(error));
        setAccountStatus("error");
      }
      throw error;
    }
  }, []);

  const value = useMemo<CloudAuthContextValue>(
    () => ({
      status,
      configured: supabaseConfiguration.configured,
      configurationMessage: supabaseConfiguration.configured
        ? null
        : supabaseConfiguration.reason,
      session,
      userId: (session?.user.id as UUID | undefined) ?? null,
      email: session?.user.email ?? null,
      accountStatus,
      accountInspection,
      accountError,
      signIn,
      signOut,
      retryAccountSetup,
      mergeAccountData,
      useAccountOnThisDevice,
    }),
    [
      accountError,
      accountInspection,
      accountStatus,
      mergeAccountData,
      retryAccountSetup,
      session,
      signIn,
      signOut,
      status,
      useAccountOnThisDevice,
    ],
  );

  return (
    <CloudAuthContext.Provider value={value}>
      {children}
    </CloudAuthContext.Provider>
  );
}

export function useCloudAuth(): CloudAuthContextValue {
  const context = useContext(CloudAuthContext);
  if (!context) {
    throw new Error("useCloudAuth doit être utilisé dans CloudAuthProvider.");
  }
  return context;
}
