"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

type RecognitionAlternative = {
  transcript: string;
};

type RecognitionResult = {
  isFinal: boolean;
  0: RecognitionAlternative;
};

type RecognitionResultList = {
  length: number;
  [index: number]: RecognitionResult;
};

type RecognitionResultEvent = Event & {
  resultIndex: number;
  results: RecognitionResultList;
};

type RecognitionErrorEvent = Event & {
  error: string;
};

type RecognitionController = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
};

type RecognitionConstructor = new () => RecognitionController;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

function recognitionErrorMessage(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Autorisez le microphone dans Safari pour utiliser la dictée.";
  }
  if (code === "no-speech") {
    return "Aucune parole détectée. Rapprochez-vous du micro et réessayez.";
  }
  if (code === "network") {
    return "La dictée vocale nécessite actuellement une connexion réseau.";
  }
  return "La dictée s’est interrompue. Vous pouvez réessayer.";
}

export function VoiceDictationButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const recognitionRef = useRef<RecognitionController | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = getRecognitionConstructor() !== null;

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
    },
    [],
  );

  const start = () => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("La dictée vocale n’est pas disponible sur ce navigateur.");
      return;
    }
    setError(null);
    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event) => {
      setError(recognitionErrorMessage(event.error));
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal && result[0]?.transcript) {
          finalParts.push(result[0].transcript.trim());
        }
      }
      const transcript = finalParts.filter(Boolean).join(" ");
      if (transcript) onTranscript(transcript);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("Le microphone est déjà utilisé. Réessayez dans un instant.");
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return (
    <div>
      <button
        type="button"
        onClick={isListening ? stop : start}
        disabled={!supported}
        aria-pressed={isListening}
        className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-5 text-sm font-semibold ${
          isListening
            ? "bg-[var(--clay)] text-white"
            : "border border-[var(--moss)] bg-[var(--card)] text-[var(--moss)]"
        } disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:opacity-65`}
      >
        <span
          className={`flex size-9 items-center justify-center rounded-full ${
            isListening ? "bg-white/15" : "bg-[var(--moss-soft)]"
          }`}
        >
          <Icon name="microphone" size={19} />
        </span>
        {isListening ? "Arrêter et garder la dictée" : "Dicter ma note"}
      </button>
      <p
        aria-live="polite"
        className={`mt-2 text-xs leading-5 ${
          error ? "text-[var(--clay)]" : "text-[var(--muted)]"
        }`}
      >
        {error ??
          (isListening
            ? "Je vous écoute… Le texte apparaît dans « Ma réflexion »."
            : supported
              ? "BrainBook ne conserve pas l’audio. Le service vocal du navigateur peut nécessiter Internet."
              : "La dictée vocale n’est pas prise en charge ici.")}
      </p>
    </div>
  );
}
