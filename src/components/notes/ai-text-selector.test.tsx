// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTextSelector } from "@/components/notes/ai-text-selector";

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Bouton introuvable : ${text}`);
  }
  return found;
}

describe("AiTextSelector", () => {
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

  it("permet de corriger puis d’utiliser une sélection native", () => {
    const onPassageSelected = vi.fn();
    act(() =>
      root.render(
        <AiTextSelector
          imageUrl="blob:page"
          initialText={"Première phrase.\nDeuxième phrase."}
          onPassageSelected={onPassageSelected}
          onRestart={vi.fn()}
        />,
      ),
    );
    const textArea = document.querySelector("#ai-recognized-text");
    expect(textArea).toBeInstanceOf(HTMLTextAreaElement);

    act(() => {
      const area = textArea as HTMLTextAreaElement;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(area, "Phrase corrigée.\nDeuxième phrase.");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const area = textArea as HTMLTextAreaElement;
    area.setSelectionRange(0, "Phrase corrigée.".length);
    act(() => button("Utiliser la sélection").click());

    expect(onPassageSelected).toHaveBeenCalledWith("Phrase corrigée.");
  });

  it("refuse une sélection vide sans perdre la transcription", () => {
    const onPassageSelected = vi.fn();
    act(() =>
      root.render(
        <AiTextSelector
          imageUrl="blob:page"
          initialText="Texte complet"
          onPassageSelected={onPassageSelected}
          onRestart={vi.fn()}
        />,
      ),
    );

    act(() => button("Utiliser la sélection").click());

    expect(onPassageSelected).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Sélectionnez une partie");
    expect(
      (document.querySelector("#ai-recognized-text") as HTMLTextAreaElement)
        .value,
    ).toBe("Texte complet");
  });
});
