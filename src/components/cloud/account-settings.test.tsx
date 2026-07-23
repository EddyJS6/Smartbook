// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountSettings } from "@/components/cloud/account-settings";
import { CloudAuthProvider } from "@/components/cloud/cloud-auth-provider";

describe("AccountSettings without configuration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reste non bloquant et présente le compte sans jargon cloud", () => {
    act(() =>
      root.render(
        <CloudAuthProvider>
          <AccountSettings />
        </CloudAuthProvider>,
      ),
    );

    expect(document.body.textContent).toContain("Connexion indisponible");
    expect(document.body.textContent).toContain(
      "Les données de cet appareil restent accessibles",
    );
    expect(document.body.textContent).not.toContain("Sauvegarde cloud");
  });
});
