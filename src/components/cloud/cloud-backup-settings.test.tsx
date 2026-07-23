// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CloudAuthProvider } from "@/components/cloud/cloud-auth-provider";
import { CloudBackupSettings } from "@/components/cloud/cloud-backup-settings";

describe("CloudBackupSettings without configuration", () => {
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

  it("reste non bloquant et n’affiche aucune inscription publique", () => {
    act(() =>
      root.render(
        <CloudAuthProvider>
          <CloudBackupSettings />
        </CloudAuthProvider>,
      ),
    );

    expect(document.body.textContent).toContain(
      "Sauvegarde cloud indisponible",
    );
    expect(document.body.textContent).toContain(
      "continue de fonctionner normalement",
    );
    expect(document.body.textContent).not.toContain("Créer un compte");
  });
});
