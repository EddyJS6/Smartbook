import type { NoteSourceType } from "@/domain/models";
import {
  normalizeMultilineText,
  type NoteFormValues,
} from "@/domain/note-validation";

export type NoteDraftWithSource = {
  values: NoteFormValues;
  sourceType: NoteSourceType;
};

export function applyScannedPassage(
  current: NoteDraftWithSource,
  passage: string,
): NoteDraftWithSource {
  return {
    values: {
      ...current.values,
      extractedText: normalizeMultilineText(passage),
    },
    sourceType: "scan",
  };
}
