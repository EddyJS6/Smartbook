"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Book,
  BookNote,
  NoteSourceType,
} from "@/domain/models";
import {
  type NoteFieldErrors,
  type NoteFormValues,
  normalizeTag,
  normalizeTags,
  validateNote,
  validateTagCandidate,
} from "@/domain/note-validation";
import { applyScannedPassage } from "@/domain/note-scan";
import { ContentArtwork } from "@/components/books/content-artwork";
import { ScanFlow } from "@/components/notes/scan-flow";
import { TagPill } from "@/components/notes/tag-pill";
import { VoiceDictationButton } from "@/components/notes/voice-dictation-button";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import { reportStorageError } from "@/storage/errors";
import { noteRepository } from "@/storage/repositories/note-repository";

type NoteFormProps =
  | {
      mode: "create";
      book: Book;
      note?: never;
    }
  | {
      mode: "edit";
      book: Book;
      note: BookNote;
    };

const defaultSuggestions = [
  "Discipline",
  "Relations",
  "Travail",
  "Confiance",
  "Habitudes",
  "Sens",
  "Argent",
  "Santé",
];

const fieldClassName =
  "w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-base text-[var(--ink)] shadow-[0_2px_12px_rgb(48_39_30_/_0.035)] placeholder:text-[#969187]";

export function NoteForm({ mode, book, note }: NoteFormProps) {
  const router = useRouter();
  const [entryMode, setEntryMode] = useState<"manual" | "scan">("manual");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanSession, setScanSession] = useState(0);
  const [sourceType, setSourceType] = useState<NoteSourceType>(
    note?.sourceType ?? "manual",
  );
  const [values, setValues] = useState<NoteFormValues>({
    title: note?.title ?? "",
    extractedText: note?.extractedText ?? "",
    personalReflection: note?.personalReflection ?? "",
    pageNumber: note?.pageNumber ?? "",
    tags: note?.tags ?? [],
  });
  const [tagDraft, setTagDraft] = useState("");
  const [personalTagSuggestions, setPersonalTagSuggestions] = useState<
    string[]
  >([]);
  const [fieldErrors, setFieldErrors] = useState<NoteFieldErrors>({});
  const [tagError, setTagError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void noteRepository
      .listAll()
      .then((notes) => {
        if (!active) return;
        const defaults = new Set(
          defaultSuggestions.map((tag) => tag.toLocaleLowerCase("fr")),
        );
        const existing = new Map<string, string>();
        for (const existingNote of notes) {
          for (const tag of existingNote.tags) {
            const normalized = normalizeTag(tag);
            const key = normalized.toLocaleLowerCase("fr");
            if (normalized && !defaults.has(key) && !existing.has(key)) {
              existing.set(key, normalized);
            }
          }
        }
        setPersonalTagSuggestions([...existing.values()].slice(0, 12));
      })
      .catch((error: unknown) => {
        reportStorageError(error);
      });
    return () => {
      active = false;
    };
  }, []);

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraSelection = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setScanFile(file);
    setScanSession((current) => current + 1);
    setEntryMode("scan");
  };

  const updateTextField = (
    field: "title" | "extractedText" | "personalReflection" | "pageNumber",
    value: string,
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "extractedText" || field === "personalReflection") {
      setFieldErrors((current) => ({ ...current, content: undefined }));
    }
  };

  const appendVoiceTranscript = (transcript: string) => {
    setValues((current) => ({
      ...current,
      personalReflection: current.personalReflection.trim()
        ? `${current.personalReflection.trimEnd()} ${transcript}`
        : transcript,
    }));
    setFieldErrors((current) => ({ ...current, content: undefined }));
    setSourceType((current) => (current === "manual" ? "voice" : current));
  };

  const addTag = (candidate = tagDraft) => {
    const validationError = validateTagCandidate(candidate, values.tags);
    if (validationError) {
      setTagError(validationError);
      return;
    }

    const normalized = normalizeTag(candidate);
    if (!normalized) {
      setTagDraft("");
      setTagError(null);
      return;
    }

    setValues((current) => ({
      ...current,
      tags: normalizeTags([...current.tags, normalized]),
    }));
    const isDefault = defaultSuggestions.some(
      (suggestion) =>
        suggestion.toLocaleLowerCase("fr") ===
        normalized.toLocaleLowerCase("fr"),
    );
    if (!isDefault) {
      setPersonalTagSuggestions((current) => {
        const withoutDuplicate = current.filter(
          (tag) =>
            tag.toLocaleLowerCase("fr") !==
            normalized.toLocaleLowerCase("fr"),
        );
        return [normalized, ...withoutDuplicate].slice(0, 12);
      });
    }
    setTagDraft("");
    setTagError(null);
  };

  const removeTag = (tagToRemove: string) => {
    setValues((current) => ({
      ...current,
      tags: current.tags.filter(
        (tag) =>
          tag.toLocaleLowerCase("fr") !==
          tagToRemove.toLocaleLowerCase("fr"),
      ),
    }));
    setTagError(null);
  };

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    }
  };

  const handleScannedPassage = (passage: string) => {
    const nextDraft = applyScannedPassage(
      { values, sourceType },
      passage,
    );
    setValues(nextDraft.values);
    setSourceType(nextDraft.sourceType);
    setFieldErrors((current) => ({ ...current, content: undefined }));
    setEntryMode("manual");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const validation = validateNote(values);
    setFieldErrors(validation.errors);
    setFormError(null);
    if (!validation.success) return;

    setIsSaving(true);

    try {
      if (mode === "create") {
        await noteRepository.create(book.id, validation.data, sourceType);
        router.replace(`/books/${book.id}?noteCreated=1`);
        return;
      }

      const updated = await noteRepository.update(note.id, validation.data);
      if (!updated) {
        setFormError("Cette note n’existe plus sur cet appareil.");
        setIsSaving(false);
        return;
      }

      router.replace(
        `/books/${book.id}/notes/${updated.id}?updated=1`,
      );
    } catch (error) {
      setFormError(reportStorageError(error).message);
      setIsSaving(false);
    }
  };

  return (
    <div className="page-content">
      <header className="pt-1">
        <BackLink
          href={
            mode === "edit" && note
              ? `/books/${book.id}/notes/${note.id}`
              : `/books/${book.id}`
          }
          label={
            mode === "edit"
              ? "Retour à la note"
              : book.contentType === "video"
                ? "Fiche de la vidéo"
                : "Fiche du livre"
          }
        />
        {mode === "edit" || entryMode === "manual" ? (
          <>
            <p className="mt-5 text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
              {book.contentType === "video"
                ? "Carnet vidéo"
                : "Carnet de lecture"}
            </p>
            <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
              {mode === "create" ? "Ajouter une note" : "Modifier la note"}
            </h1>
          </>
        ) : null}
      </header>

      {mode === "edit" || entryMode === "manual" ? (
        <section className="mt-6 flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-3">
          <ContentArtwork
            content={book}
            className={`w-16 shrink-0 rounded-xl shadow-sm ${
              book.contentType === "video" ? "aspect-video" : "aspect-[2/3]"
            }`}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold">{book.title}</p>
            <p className="mt-1 truncate text-sm text-[var(--muted)]">
              {book.author}
            </p>
          </div>
        </section>
      ) : null}

      {mode === "create" &&
      entryMode === "manual" &&
      book.contentType !== "video" ? (
        <section aria-label="Scan rapide" className="mt-6">
          <input
            ref={cameraInputRef}
            id="scan-camera-image"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraSelection}
            className="sr-only"
          />
          <button
            type="button"
            onClick={openCamera}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-[var(--moss)] px-5 py-3 text-left text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Icon name="camera" size={21} />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Scanner une page
              </span>
              <span className="mt-0.5 block text-xs text-white/75">
                Ouvre directement l’appareil photo
              </span>
            </span>
          </button>
        </section>
      ) : null}

      {mode === "create" && entryMode === "scan" && scanFile ? (
        <ScanFlow
          key={scanSession}
          file={scanFile}
          onPassageReady={handleScannedPassage}
        />
      ) : (
      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-6">
        {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
        {fieldErrors.content ? (
          <StatusMessage tone="error">{fieldErrors.content}</StatusMessage>
        ) : null}

        {sourceType === "scan" ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--moss-soft)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--moss)]">
              <Icon name="camera" size={18} />
              Passage extrait depuis une photo
            </div>
            {mode === "create" ? (
              <button
                type="button"
                onClick={openCamera}
                className="mt-2 min-h-11 text-xs font-semibold text-[var(--moss)]"
              >
                Recommencer le scan ou remplacer ce passage
              </button>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="note-title" className="mb-2 block text-sm font-semibold">
            Titre de la note{" "}
            <span className="font-normal text-[var(--muted)]">(facultatif)</span>
          </label>
          <input
            id="note-title"
            type="text"
            maxLength={160}
            value={values.title ?? ""}
            onChange={(event) => updateTextField("title", event.target.value)}
            placeholder="Ex. Une idée à appliquer"
            className={`${fieldClassName} min-h-13`}
          />
        </div>

        <VoiceDictationButton onTranscript={appendVoiceTranscript} />

        <div>
          <label
            htmlFor="extracted-text"
            className="mb-2 block text-sm font-semibold"
          >
            {book.contentType === "video"
              ? "Extrait ou idée de la vidéo"
              : "Passage du livre"}
          </label>
          <p
            id="extracted-text-help"
            className="mb-2 text-xs leading-5 text-[var(--muted)]"
          >
            {book.contentType === "video"
              ? "Notez une idée exprimée dans la vidéo, si vous souhaitez la distinguer de votre réflexion."
              : "Recopiez la citation ou le passage que vous souhaitez conserver."}
          </p>
          <textarea
            id="extracted-text"
            value={values.extractedText}
            onChange={(event) =>
              updateTextField("extractedText", event.target.value)
            }
            aria-describedby="extracted-text-help"
            rows={7}
            placeholder={
              book.contentType === "video"
                ? "Écrivez une idée de la vidéo…"
                : "Écrivez ou collez le passage ici…"
            }
            className={`${fieldClassName} min-h-44 resize-y leading-6`}
          />
        </div>

        <div>
          <label
            htmlFor="personal-reflection"
            className="mb-2 block text-sm font-semibold"
          >
            Ma réflexion
          </label>
          <p
            id="personal-reflection-help"
            className="mb-2 text-xs leading-5 text-[var(--muted)]"
          >
            Qu’est-ce que cette idée signifie pour vous ? Comment pourriez-vous
            l’utiliser ?
          </p>
          <textarea
            id="personal-reflection"
            value={values.personalReflection}
            onChange={(event) =>
              updateTextField("personalReflection", event.target.value)
            }
            aria-describedby="personal-reflection-help"
            rows={6}
            placeholder="Notez votre interprétation personnelle…"
            className={`${fieldClassName} min-h-36 resize-y leading-6`}
          />
        </div>

        <div>
          <label
            htmlFor="page-number"
            className="mb-2 block text-sm font-semibold"
          >
            {book.contentType === "video"
              ? "Horodatage ou référence"
              : "Page ou référence"}{" "}
            <span className="font-normal text-[var(--muted)]">(facultatif)</span>
          </label>
          <input
            id="page-number"
            type="text"
            value={values.pageNumber}
            onChange={(event) =>
              updateTextField("pageNumber", event.target.value)
            }
            placeholder={
              book.contentType === "video"
                ? "12:45 ou Chapitre 3"
                : "42, 42-43 ou Chapitre 3"
            }
            className={`${fieldClassName} min-h-13`}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Tags</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Classez cette note avec vos propres tags ou une suggestion.
          </p>

          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <label htmlFor="tag-input" className="block text-sm font-semibold">
              Créer un tag personnalisé
            </label>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Par exemple : Philosophie, À relire ou Projet personnel.
            </p>
            <div className="mt-3 grid min-w-0 gap-2 min-[24rem]:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id="tag-input"
                type="text"
                value={tagDraft}
                maxLength={30}
                enterKeyHint="done"
                autoCapitalize="sentences"
                onChange={(event) => {
                  setTagDraft(event.target.value);
                  setTagError(null);
                }}
                onKeyDown={handleTagKeyDown}
                placeholder="Mon nouveau tag"
                aria-describedby={tagError ? "tag-error" : "tag-input-help"}
                className={`${fieldClassName} min-h-12 min-w-0`}
              />
              <span id="tag-input-help" className="sr-only">
                Validez avec Entrée ou avec le bouton Ajouter.
              </span>
              <button
                type="button"
                onClick={() => addTag()}
                className="min-h-12 shrink-0 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
              >
                Ajouter
              </button>
            </div>
          </div>

          {tagError ? (
            <p id="tag-error" role="alert" className="mt-2 text-sm text-[var(--clay)]">
              {tagError}
            </p>
          ) : null}

          {values.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Tags ajoutés">
              {values.tags.map((tag) => (
                <TagPill
                  key={tag.toLocaleLowerCase("fr")}
                  tag={tag}
                  onRemove={() => removeTag(tag)}
                />
              ))}
            </div>
          ) : null}

          {personalTagSuggestions.length > 0 ? (
            <TagSuggestionGroup
              label="Mes tags"
              suggestions={personalTagSuggestions}
              selectedTags={values.tags}
              onAdd={addTag}
            />
          ) : null}

          <TagSuggestionGroup
            label="Suggestions"
            suggestions={defaultSuggestions}
            selectedTags={values.tags}
            onAdd={addTag}
          />
        </fieldset>

        <button
          type="submit"
          disabled={isSaving}
          className="flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--moss)] px-5 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving
            ? "Enregistrement…"
            : mode === "create"
              ? "Enregistrer la note"
              : "Enregistrer les modifications"}
        </button>
      </form>
      )}
    </div>
  );
}

function TagSuggestionGroup({
  label,
  suggestions,
  selectedTags,
  onAdd,
}: {
  label: string;
  suggestions: readonly string[];
  selectedTags: readonly string[];
  onAdd: (tag: string) => void;
}) {
  const availableSuggestions = suggestions.filter(
    (suggestion) =>
      !selectedTags.some(
        (tag) =>
          tag.toLocaleLowerCase("fr") ===
          suggestion.toLocaleLowerCase("fr"),
      ),
  );
  if (availableSuggestions.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <div
        className="mt-2 flex min-w-0 flex-wrap gap-2"
        data-testid={`tag-suggestions-${label.toLocaleLowerCase("fr").replace(" ", "-")}`}
      >
        {availableSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAdd(suggestion)}
            className="min-h-10 max-w-full rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted)]"
          >
            <span className="block max-w-full truncate">+ {suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
