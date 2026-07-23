// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@/domain/models";
import { NoteForm } from "@/components/notes/note-form";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const book: Book = {
  id: "10000000-0000-4000-8000-000000000000",
  title: "Sapiens",
  author: "Yuval Noah Harari",
  coverImageId: null,
  status: "reading",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buttonWithText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Bouton introuvable : ${text}`);
  }
  return button;
}

describe("NoteForm scan mode", () => {
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
    act(() => root.render(<NoteForm mode="create" book={book} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    replace.mockReset();
  });

  it("propose un bouton qui déclenche directement l’appareil photo", () => {
    const cameraInput = document.querySelector("#scan-camera-image");
    expect(cameraInput).toBeInstanceOf(HTMLInputElement);
    expect(cameraInput?.getAttribute("accept")).toBe("image/*");
    expect(cameraInput?.getAttribute("capture")).toBe("environment");
    const openCamera = vi.spyOn(cameraInput as HTMLInputElement, "click");

    act(() => buttonWithText("Scanner une page").click());

    expect(openCamera).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain(
      "Ouvre directement l’appareil photo",
    );
  });

  it("conserve la réflexion si l’utilisateur referme l’appareil photo", () => {
    const reflection = document.querySelector("#personal-reflection");
    expect(reflection).toBeInstanceOf(HTMLTextAreaElement);

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(reflection, "Réflexion à conserver");
      reflection?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => buttonWithText("Scanner une page").click());

    expect(
      (document.querySelector("#personal-reflection") as HTMLTextAreaElement)
        .value,
    ).toBe("Réflexion à conserver");
  });

  it("explique un fichier invalide au moment de l’envoi", async () => {
    const input = document.querySelector("#scan-camera-image");
    expect(input).toBeInstanceOf(HTMLInputElement);
    const file = new File(["pas une image"], "document.txt", {
      type: "text/plain",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: {
        0: file,
        length: 1,
        item: (index: number) => index === 0 ? file : null,
      },
    });

    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Votre photo est prête");

    await act(async () => {
      buttonWithText("Envoyer").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain(
      "Le fichier choisi n’est pas une image reconnue",
    );
    expect(buttonWithText("Envoyer")).toBeTruthy();
  });
});
