"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Book } from "@/domain/models";
import {
  type BookFieldErrors,
  type BookFormValues,
  validateBook,
} from "@/domain/book-validation";
import { bookStatusOptions } from "@/domain/book-status";
import { processCoverImage } from "@/lib/image-processing";
import { useTemporaryObjectUrl } from "@/hooks/use-temporary-object-url";
import { BookCover } from "@/components/books/book-cover";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/components/ui/icon";
import { StatusMessage } from "@/components/ui/status-message";
import {
  BrainBookStorageError,
  reportStorageError,
} from "@/storage/errors";
import {
  bookRepository,
  type CoverMutation,
} from "@/storage/repositories/book-repository";

type BookFormProps =
  | {
      mode: "create";
      book?: never;
    }
  | {
      mode: "edit";
      book: Book;
    };

const fieldClassName =
  "min-h-13 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-base text-[var(--ink)] shadow-[0_2px_12px_rgb(48_39_30_/_0.035)] placeholder:text-[#969187]";

export function BookForm({ mode, book }: BookFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<BookFormValues>({
    title: book?.title ?? "",
    author: book?.author ?? "",
    status: book?.status ?? "to_read",
  });
  const [fieldErrors, setFieldErrors] = useState<BookFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [coverMutation, setCoverMutation] = useState<CoverMutation>(
    mode === "edit" ? { kind: "keep" } : { kind: "remove" },
  );
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectedImage =
    coverMutation.kind === "replace" ? coverMutation.image : null;
  const selectedImageUrl = useTemporaryObjectUrl(selectedImage?.blob ?? null);
  const hasExistingCover = Boolean(book?.coverImageId);
  const showExistingCover =
    mode === "edit" && coverMutation.kind === "keep" && hasExistingCover;

  const updateField = <Key extends keyof BookFormValues>(
    key: Key,
    value: BookFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "title" || key === "author") {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const handleImageSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormError(null);
    setIsProcessingImage(true);

    try {
      const image = await processCoverImage(file);
      setCoverMutation({ kind: "replace", image });
    } catch (error) {
      const message =
        error instanceof BrainBookStorageError
          ? error.message
          : reportStorageError(error).message;
      setFormError(message);
      event.target.value = "";
    } finally {
      setIsProcessingImage(false);
    }
  };

  const removeCover = () => {
    setCoverMutation({ kind: "remove" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const restoreExistingCover = () => {
    setCoverMutation({ kind: "keep" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || isProcessingImage) return;

    const validation = validateBook(values);
    setFieldErrors(validation.errors);
    setFormError(null);
    if (!validation.success) return;

    setIsSaving(true);

    try {
      if (mode === "create") {
        const created = await bookRepository.create(
          validation.data,
          selectedImage ?? undefined,
        );
        router.replace(`/books/${created.id}?created=1`);
        return;
      }

      const updated = await bookRepository.update(
        book.id,
        validation.data,
        coverMutation,
      );

      if (!updated) {
        setFormError("Ce livre n’existe plus dans votre bibliothèque.");
        setIsSaving(false);
        return;
      }

      router.replace(`/books/${updated.id}?updated=1`);
    } catch (error) {
      setFormError(reportStorageError(error).message);
      setIsSaving(false);
    }
  };

  const previewBook = {
    title: values.title,
    author: values.author,
    coverImageId:
      showExistingCover && book ? book.coverImageId : null,
  };

  return (
    <div className="page-content">
      <header className="mb-7 pt-1">
        <BackLink
          href={mode === "edit" && book ? `/books/${book.id}` : "/"}
          label={mode === "edit" ? "Fiche du livre" : "Bibliothèque"}
        />
        <p className="mt-5 text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
          {mode === "create" ? "Nouveau livre" : "Votre bibliothèque"}
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight font-semibold tracking-[-0.04em]">
          {mode === "create" ? "Ajouter un livre" : "Modifier le livre"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          {mode === "create"
            ? "Commencez par les informations essentielles. Vous pourrez les modifier plus tard."
            : "Mettez à jour les informations que vous souhaitez conserver."}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}

        <section
          aria-labelledby="cover-title"
          className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5"
        >
          <div className="mb-4">
            <h2 id="cover-title" className="font-semibold">
              Couverture
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Facultative · image redimensionnée à 1 200 px maximum
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-2xl shadow-[0_8px_22px_rgb(48_39_30_/_0.12)]">
              {selectedImageUrl ? (
                <Image
                  src={selectedImageUrl}
                  alt="Prévisualisation de la couverture"
                  fill
                  unoptimized
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <BookCover book={previewBook} className="h-full w-full" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              <label
                htmlFor="cover-image"
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--moss)]"
              >
                <Icon name="image" size={18} />
                {isProcessingImage
                  ? "Préparation…"
                  : selectedImage || hasExistingCover
                    ? "Remplacer"
                    : "Choisir une image"}
              </label>
              <input
                ref={fileInputRef}
                id="cover-image"
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageSelection(event)}
                disabled={isProcessingImage || isSaving}
                className="sr-only"
              />

              {selectedImage || showExistingCover ? (
                <button
                  type="button"
                  onClick={removeCover}
                  disabled={isSaving}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--clay)]"
                >
                  <Icon name="trash" size={17} />
                  Retirer
                </button>
              ) : null}

              {selectedImage && hasExistingCover ? (
                <button
                  type="button"
                  onClick={restoreExistingCover}
                  disabled={isSaving}
                  className="min-h-11 w-full rounded-xl px-3 text-xs font-semibold text-[var(--muted)]"
                >
                  Garder l’ancienne
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-semibold">
            Titre du livre
          </label>
          <input
            id="title"
            name="title"
            type="text"
            autoComplete="off"
            value={values.title}
            onChange={(event) => updateField("title", event.target.value)}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            placeholder="Ex. Une chambre à soi"
            className={fieldClassName}
          />
          {fieldErrors.title ? (
            <p id="title-error" className="mt-2 text-sm text-[var(--clay)]">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="author" className="mb-2 block text-sm font-semibold">
            Auteur
          </label>
          <input
            id="author"
            name="author"
            type="text"
            autoComplete="off"
            value={values.author}
            onChange={(event) => updateField("author", event.target.value)}
            aria-invalid={Boolean(fieldErrors.author)}
            aria-describedby={fieldErrors.author ? "author-error" : undefined}
            placeholder="Ex. Virginia Woolf"
            className={fieldClassName}
          />
          {fieldErrors.author ? (
            <p id="author-error" className="mt-2 text-sm text-[var(--clay)]">
              {fieldErrors.author}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="status" className="mb-2 block text-sm font-semibold">
            Statut de lecture
          </label>
          <select
            id="status"
            name="status"
            value={values.status}
            onChange={(event) =>
              updateField(
                "status",
                event.target.value as BookFormValues["status"],
              )
            }
            className={fieldClassName}
          >
            {bookStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isSaving || isProcessingImage}
          className="flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--moss)] px-5 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_rgb(49_95_77_/_0.16)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving
            ? "Enregistrement…"
            : mode === "create"
              ? "Enregistrer le livre"
              : "Enregistrer les modifications"}
        </button>
      </form>
    </div>
  );
}
