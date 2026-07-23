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

type CloudAuthStatus =
  | "unavailable"
  | "loading"
  | "disconnected"
  | "connected";

type CloudAuthContextValue = {
  status: CloudAuthStatus;
  configured: boolean;
  configurationMessage: string | null;
  session: Session | null;
  userId: UUID | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
    return "Connexion à Supabase impossible. Vérifiez Internet.";
  }
  return "La connexion a échoué. Vérifiez vos identifiants et la configuration Supabase.";
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
  const syncTimerRef = useRef<number | null>(null);

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
      if (!nextSession) syncService.cancelCurrentSync();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id as UUID | undefined;
    if (status !== "connected" || !userId) return;

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
  }, [session, status]);

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
      signIn,
      signOut,
    }),
    [session, signIn, signOut, status],
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
