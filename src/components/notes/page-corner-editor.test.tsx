// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackPageCorners } from "@/domain/document-geometry";
import { PageCornerEditor } from "@/components/notes/page-corner-editor";

describe("PageCornerEditor", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onCornersChange = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    globalThis.cancelAnimationFrame = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <PageCornerEditor
          imageUrl="blob:test"
          imageWidth={1_200}
          imageHeight={1_800}
          corners={fallbackPageCorners()}
          detection={null}
          isDetecting={false}
          error={null}
          warnings={[]}
          onCornersChange={onCornersChange}
          onAutomaticDetection={vi.fn()}
          onRotate={vi.fn()}
          onRetake={vi.fn()}
          onRectify={vi.fn()}
          onContinueWithoutRectifying={vi.fn()}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    onCornersChange.mockReset();
  });

  it("affiche les quatre poignées, les secours et le réglage accessible", () => {
    expect(
      document.querySelectorAll('button[aria-label^="Déplacer coin"]'),
    ).toHaveLength(4);
    expect(document.body.textContent).toContain("Détection automatique");
    expect(document.body.textContent).toContain("Utiliser toute l’image");
    expect(document.querySelector("#active-page-corner")).toBeTruthy();
  });

  it("réinitialise les coins et utilise toute l’image", () => {
    const buttons = [...document.querySelectorAll("button")];
    act(() =>
      buttons
        .find((button) => button.textContent?.includes("Utiliser toute"))
        ?.click(),
    );
    expect(onCornersChange).toHaveBeenCalledWith({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    });
  });
});
