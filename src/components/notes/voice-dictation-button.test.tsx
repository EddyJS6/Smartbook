// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceDictationButton } from "@/components/notes/voice-dictation-button";

describe("VoiceDictationButton", () => {
  afterEach(() => {
    delete (
      window as typeof window & { webkitSpeechRecognition?: unknown }
    ).webkitSpeechRecognition;
    document.body.innerHTML = "";
  });

  it("transmet uniquement les résultats vocaux finalisés", () => {
    const instances: Array<
      | {
          onstart: (() => void) | null;
          onend: (() => void) | null;
          onresult: ((event: unknown) => void) | null;
          onerror: ((event: unknown) => void) | null;
          start: () => void;
          stop: () => void;
          abort: () => void;
        }
    > = [];
    class RecognitionMock {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        instances.push(this);
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    (
      window as typeof window & {
        webkitSpeechRecognition?: typeof RecognitionMock;
      }
    ).webkitSpeechRecognition = RecognitionMock;
    const onTranscript = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() =>
      root.render(<VoiceDictationButton onTranscript={onTranscript} />),
    );
    const button = document.querySelector("button");
    act(() => button?.click());
    act(() => {
      instances[0]?.onresult?.({
        resultIndex: 0,
        results: {
          length: 2,
          0: { isFinal: false, 0: { transcript: "brouillon" } },
          1: { isFinal: true, 0: { transcript: "Texte final" } },
        },
      });
    });

    expect(onTranscript).toHaveBeenCalledWith("Texte final");
    act(() => root.unmount());
  });
});
