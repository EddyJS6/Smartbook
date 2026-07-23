// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOpenCvLoaderState,
  loadOpenCv,
  resetOpenCvLoaderForTests,
} from "@/services/opencv-loader";
import type { OpenCv } from "@/services/opencv-types";

describe("OpenCV loader", () => {
  beforeEach(() => {
    resetOpenCvLoaderForTests();
    document.head.innerHTML = "";
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { match: vi.fn().mockResolvedValue(undefined) },
    });
    delete (window as typeof window & { cv?: OpenCv }).cv;
  });

  it("partage une seule initialisation simultanée", async () => {
    const first = loadOpenCv();
    const second = loadOpenCv();
    expect(first).toBe(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const script = document.querySelector<HTMLScriptElement>(
      "script[data-brainbook-opencv]",
    );
    expect(script).toBeTruthy();
    (window as typeof window & { cv?: OpenCv }).cv = {} as OpenCv;
    script?.dispatchEvent(new Event("load"));

    await expect(first).resolves.toBe(
      (window as typeof window & { cv?: OpenCv }).cv,
    );
    expect(getOpenCvLoaderState()).toBe("ready");
    expect(document.querySelectorAll("script[data-brainbook-opencv]")).toHaveLength(
      1,
    );
  });

  it("refuse un premier chargement hors ligne sans cache", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await expect(loadOpenCv()).rejects.toMatchObject({ code: "offline" });
    expect(getOpenCvLoaderState()).toBe("error");
  });
});
