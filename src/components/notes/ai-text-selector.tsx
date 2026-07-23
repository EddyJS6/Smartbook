"use client";

import { useRef, useState } from "react";
import { normalizeMultilineText } from "@/domain/note-validation";
import { StatusMessage } from "@/components/ui/status-message";

type AiTextSelectorProps = {
  imageUrl: string;
  initialText: string;
  onPassageSelected: (passage: string) => void;
  onRestart: () => void;
};

export function AiTextSelector({
  imageUrl,
  initialText,
  onPassageSelected,
  onRestart,
}: AiTextSelectorProps) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleUsePassage = (passage: string) => {
    const normalized = normalizeMultilineText(passage);
    if (!normalized) {
      setError("Sélectionnez une partie du texte ou utilisez la page entière.");
      return;
    }
    setError(null);
    onPassageSelected(normalized);
  };

  const useNativeSelection = () => {
    const textArea = textAreaRef.current;
    if (!textArea) return;
    handleUsePassage(
      text.slice(textArea.selectionStart, textArea.selectionEnd),
    );
  };

  return (
    <section aria-labelledby="ai-selection-title" className="space-y-4">
      <div>
        <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[var(--clay)] uppercase">
          Texte reconnu par l’IA
        </p>
        <h2 id="ai-selection-title" className="mt-1 text-xl font-semibold">
          Corrigez et sélectionnez votre passage
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Comparez avec la page, corrigez les erreurs éventuelles, puis
          sélectionnez précisément le passage à conserver.
        </p>
      </div>

      <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--moss)]">
          Afficher la photo pour comparer
        </summary>
        <div className="border-t border-[var(--line)] bg-[#292925] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Page envoyée à la reconnaissance IA"
            className="max-h-[55dvh] w-full rounded-xl object-contain"
          />
        </div>
      </details>

      <textarea
        id="ai-recognized-text"
        ref={textAreaRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        rows={18}
        className="w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-4 text-base leading-7"
      />

      <p className="text-xs leading-5 text-[var(--muted)]">
        L’IA peut encore confondre ou omettre un mot. La transcription reste
        entièrement modifiable avant son ajout à la note.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={useNativeSelection}
          className="min-h-12 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
        >
          Utiliser la sélection
        </button>
        <button
          type="button"
          onClick={() => handleUsePassage(text)}
          className="min-h-12 rounded-2xl bg-[var(--moss)] px-4 text-sm font-semibold text-white"
        >
          Utiliser tout le texte
        </button>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="min-h-11 w-full text-sm font-semibold text-[var(--muted)]"
      >
        Recommencer la reconnaissance
      </button>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
