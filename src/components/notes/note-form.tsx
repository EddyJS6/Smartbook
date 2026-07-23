"use client";

import { useState } from "react";
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
import { BookCover } from "@/components/books/book-cover";
import { ScanFlow } from "@/components/notes/scan-flow";
import { TagPill } from "@/components/notes/tag-pill";
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

const suggestions = [
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
  const [sourceType, setSourceType] = useState<NoteSourceType>(
    note?.sourceType ?? "manual",
  );
  const [values, setValues] = useState<NoteFormValues>({
    extractedText: note?.extractedText ?? "",
    personalReflection: note?.personalReflection ?? "",
    pageNumber: note?.pageNumber ?? "",
    tags: note?.tags ?? [],
  });
  const [tagDraft, setTagDraft] = useState("");
  const [fieldErrors, setFieldErrors] = useState<NoteFieldErrors>({});
  const [tagError, setTagError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateTextField = (
    field: "extractedText" | "personalReflection" | "pageNumber",
    value: string,
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "extractedText" || field === "personalReflection") {
      setFieldErrors((current) => ({ ...current, content: undefined }));
    }
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
          label={mode === "edit" ? "Retour à la note" : "Fiche du livre"}
        />
        <p className="mt-5 text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
          Carnet de lecture
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
          {mode === "create" ? "Ajouter une note" : "Modifier la note"}
        </h1>
      </header>

      <section className="mt-6 flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-3">
        <BookCover
          book={book}
          className="aspect-[2/3] w-14 shrink-0 rounded-xl shadow-sm"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{book.title}</p>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">
            {book.author}
          </p>
        </div>
      </section>

      {mode === "create" ? (
        <section aria-label="Mode d’ajout" className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            aria-pressed={entryMode === "manual"}
            onClick={() => setEntryMode("manual")}
            className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-xs font-semibold ${
              entryMode === "manual"
                ? "border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]"
                : "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            <Icon name="edit" size={20} />
            Saisir manuellement
          </button>
          <button
            type="button"
            aria-pressed={entryMode === "scan"}
            onClick={() => setEntryMode("scan")}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-xs font-semibold ${
              entryMode === "scan"
                ? "border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]"
                : "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            <Icon name="camera" size={19} />
            Scanner une page
            <span className="text-[0.58rem] font-normal">OCR sur l’appareil</span>
          </button>
        </section>
      ) : null}

      {mode === "create" && entryMode === "scan" ? (
        <ScanFlow
          onPassageReady={handleScannedPassage}
          onExitToManual={() => setEntryMode("manual")}
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
                onClick={() => setEntryMode("scan")}
                className="mt-2 min-h-11 text-xs font-semibold text-[var(--moss)]"
              >
                Recommencer le scan ou remplacer ce passage
              </button>
            ) : null}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="extracted-text"
            className="mb-2 block text-sm font-semibold"
          >
            Passage du livre
          </label>
          <p
            id="extracted-text-help"
            className="mb-2 text-xs leading-5 text-[var(--muted)]"
          >
            Recopiez pour le moment la citation ou le passage que vous souhaitez
            conserver.
          </p>
          <textarea
            id="extracted-text"
            value={values.extractedText}
            onChange={(event) =>
              updateTextField("extractedText", event.target.value)
            }
            aria-describedby="extracted-text-help"
            rows={7}
            placeholder="Écrivez ou collez le passage ici…"
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
            Page ou référence{" "}
            <span className="font-normal text-[var(--muted)]">(facultatif)</span>
          </label>
          <input
            id="page-number"
            type="text"
            value={values.pageNumber}
            onChange={(event) =>
              updateTextField("pageNumber", event.target.value)
            }
            placeholder="42, 42-43 ou Chapitre 3"
            className={`${fieldClassName} min-h-13`}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Tags</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Validez avec Entrée ou avec le bouton Ajouter.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              id="tag-input"
              type="text"
              value={tagDraft}
              onChange={(event) => {
                setTagDraft(event.target.value);
                setTagError(null);
              }}
              onKeyDown={handleTagKeyDown}
              placeholder="Ajouter un tag"
              aria-describedby={tagError ? "tag-error" : undefined}
              className={`${fieldClassName} min-h-12 min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => addTag()}
              className="min-h-12 shrink-0 rounded-2xl border border-[var(--moss)] px-4 text-sm font-semibold text-[var(--moss)]"
            >
              Ajouter
            </button>
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

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((suggestion) => {
              const alreadyAdded = values.tags.some(
                (tag) =>
                  tag.toLocaleLowerCase("fr") ===
                  suggestion.toLocaleLowerCase("fr"),
              );

              return (
                <button
                  key={suggestion}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => addTag(suggestion)}
                  className="min-h-10 shrink-0 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted)] disabled:opacity-40"
                >
                  + {suggestion}
                </button>
              );
            })}
          </div>
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
