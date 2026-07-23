// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CloudAuthProvider,
  useCloudAuth,
} from "@/components/cloud/cloud-auth-provider";

const mocks = vi.hoisted(() => ({
  session: null as null | {
    user: { id: string; email: string };
  },
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
  authCallback: null as null | ((event: string, session: unknown) => void),
  cancelCurrentSync: vi.fn(),
  initializeAccount: vi.fn(async () => ({
    status: "ready",
    action: "alreadyReady",
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseConfiguration: { configured: true },
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: mocks.session },
        error: null,
      }),
      onAuthStateChange: (
        callback: (event: string, session: unknown) => void,
      ) => {
        mocks.authCallback = callback;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      },
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  }),
}));

vi.mock("@/sync/sync-service", () => ({
  syncService: {
    cancelCurrentSync: mocks.cancelCurrentSync,
    initializeAccount: mocks.initializeAccount,
    getSyncStatus: vi.fn(async () => ({
      firstSyncCompleted: false,
      associatedUserId: null,
    })),
    runFullSync: vi.fn(),
    mergeLibraries: vi.fn(),
    clearLocalDataForNewAccount: vi.fn(),
  },
}));

function Probe() {
  const auth = useCloudAuth();
  return (
    <div>
      <span id="status">{auth.status}</span>
      <span id="email">{auth.email}</span>
      <span id="account-status">{auth.accountStatus}</span>
      <button
        type="button"
        onClick={() => void auth.signIn("eddy@example.com", "secret")}
      >
        Connexion test
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        Déconnexion test
      </button>
    </div>
  );
}

describe("CloudAuthProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.session = null;
    mocks.authCallback = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("restaure la session persistée au lancement", async () => {
    mocks.session = {
      user: {
        id: "90000000-0000-4000-8000-000000000000",
        email: "eddy@example.com",
      },
    };
    await act(async () => {
      root.render(
        <CloudAuthProvider>
          <Probe />
        </CloudAuthProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector("#status")?.textContent).toBe("connected");
    expect(document.querySelector("#email")?.textContent).toBe(
      "eddy@example.com",
    );
    expect(mocks.initializeAccount).toHaveBeenCalledWith(
      "90000000-0000-4000-8000-000000000000",
    );
  });

  it("utilise la connexion par email/mot de passe et la déconnexion locale", async () => {
    await act(async () => {
      root.render(
        <CloudAuthProvider>
          <Probe />
        </CloudAuthProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const buttons = [...document.querySelectorAll("button")];
    await act(async () => {
      buttons[0].click();
      await Promise.resolve();
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "eddy@example.com",
      password: "secret",
    });

    await act(async () => {
      buttons[1].click();
      await Promise.resolve();
    });
    expect(mocks.cancelCurrentSync).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
