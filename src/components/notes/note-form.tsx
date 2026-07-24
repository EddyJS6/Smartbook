"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Book,
  BookNote,
  NoteDocument,
  NoteSourceType,
} from "@/domain/models";
import {
  appendPlainTextToDocument,
  documentFromPlainText,
  noteToDocument,
} from "@/domain/note-document";
import {
  type NoteFieldErrors,
  type NoteFormValues,
  validateNote,
} from "@/domain/note-validation";
import { applyScannedPassage } from "@/domain/note-scan";
import { ContentArtwork } from "@/components/books/content-artwork";
import { RichNoteEditor } from "@/components/notes/rich-note-editor";
import { ScanFlow } from "@/components/notes/scan-flow";
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
    formattedContent: note ? noteToDocument(note) : [],
    extractedText: note?.extractedText ?? "",
    personalReflection: note?.personalReflection ?? "",
    pageNumber: note?.pageNumber ?? "",
    tags: note?.tags ?? [],
  });
  const [fieldErrors, setFieldErrors] = useState<NoteFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const updateDocument = (formattedContent: NoteDocument) => {
    setValues((current) => ({ ...current, formattedContent }));
    setFieldErrors((current) => ({ ...current, content: undefined }));
  };

  const appendVoiceTranscript = (transcript: string) => {
    setValues((current) => ({
      ...current,
      formattedContent: appendPlainTextToDocument(
        current.formattedContent ?? [],
        transcript,
      ),
    }));
    setFieldErrors((current) => ({ ...current, content: undefined }));
    setSourceType((current) => (current === "manual" ? "voice" : current));
  };

  const handleScannedPassage = (passage: string) => {
    const nextDraft = applyScannedPassage(
      { values, sourceType },
      passage,
    );
    setValues({
      ...nextDraft.values,
      formattedContent: documentFromPlainText(passage),
    });
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
      router.replace(`/books/${book.id}/notes/${updated.id}?updated=1`);
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
          {formError ? (
            <StatusMessage tone="error">{formError}</StatusMessage>
          ) : null}
          {fieldErrors.content ? (
            <StatusMessage tone="error">{fieldErrors.content}</StatusMessage>
          ) : null}

          {sourceType === "scan" ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--moss-soft)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--moss)]">
                <Icon name="camera" size={18} />
                Texte extrait depuis une photo
              </div>
              {mode === "create" ? (
                <button
                  type="button"
                  onClick={openCamera}
                  className="mt-2 min-h-11 text-xs font-semibold text-[var(--moss)]"
                >
                  Recommencer le scan
                </button>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="note-title"
              className="mb-2 block text-sm font-semibold"
            >
              Titre
            </label>
            <input
              id="note-title"
              type="text"
              maxLength={160}
              value={values.title ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ex. Une idée à retenir"
              className={`${fieldClassName} min-h-13`}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label id="note-content-label" className="text-sm font-semibold">
                Note
              </label>
              <VoiceDictationButton
                onTranscript={appendVoiceTranscript}
                compact
              />
            </div>
            <p
              id="note-content-help"
              className="mb-2 text-xs leading-5 text-[var(--muted)]"
            >
              Écrivez librement ou utilisez le micro. Sélectionnez du texte pour
              le mettre en forme.
            </p>
            <RichNoteEditor
              value={values.formattedContent ?? []}
              onChange={updateDocument}
              labelledBy="note-content-label"
              describedBy="note-content-help"
            />
          </div>

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
