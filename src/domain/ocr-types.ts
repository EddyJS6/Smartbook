export const OCR_LANGUAGES = [
  { code: "fra", label: "Français" },
  { code: "eng", label: "Anglais" },
  { code: "pol", label: "Polonais" },
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]["code"];

export type OcrImageMode = "original" | "grayscale" | "enhanced";
