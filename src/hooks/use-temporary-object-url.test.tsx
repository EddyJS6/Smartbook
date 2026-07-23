// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTemporaryObjectUrl } from "@/hooks/use-temporary-object-url";

function ObjectUrlProbe({ blob }: { blob: Blob | null }) {
  const url = useTemporaryObjectUrl(blob);
  return <span>{url ?? "aucune"}</span>;
}

describe("useTemporaryObjectUrl", () => {
  let container: HTMLDivElement;
  let root: Root;
  const createObjectUrl = vi.fn();
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    createObjectUrl
      .mockReturnValueOnce("blob:brainbook-preview-1")
      .mockReturnValueOnce("blob:brainbook-preview-2");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
  });

  it("révoque l’ancienne URL lors du remplacement et au démontage", () => {
    const first = new Blob(["première"]);
    const second = new Blob(["seconde"]);

    act(() => root.render(<ObjectUrlProbe blob={first} />));
    expect(createObjectUrl).toHaveBeenCalledWith(first);

    act(() => root.render(<ObjectUrlProbe blob={second} />));
    expect(revokeObjectUrl).toHaveBeenCalledWith(
      "blob:brainbook-preview-1",
    );

    act(() => root.unmount());
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    root = createRoot(container);
  });
});
