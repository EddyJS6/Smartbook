export type StorageErrorKind =
  | "unavailable"
  | "quota"
  | "invalid_image"
  | "not_found"
  | "unknown";

export class BrainBookStorageError extends Error {
  constructor(
    public readonly kind: StorageErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrainBookStorageError";
  }
}

function getErrorName(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name;
  }

  return "";
}

export function normalizeStorageError(error: unknown): BrainBookStorageError {
  if (error instanceof BrainBookStorageError) {
    return error;
  }

  const name = getErrorName(error);

  if (name === "QuotaExceededError") {
    return new BrainBookStorageError(
      "quota",
      "L’espace de stockage de l’iPhone est insuffisant pour enregistrer ces données.",
      { cause: error },
    );
  }

  if (
    name === "MissingAPIError" ||
    name === "SecurityError" ||
    name === "InvalidStateError"
  ) {
    return new BrainBookStorageError(
      "unavailable",
      "Le stockage local n’est pas disponible. Vérifiez que la navigation privée est désactivée, puis réessayez.",
      { cause: error },
    );
  }

  return new BrainBookStorageError(
    "unknown",
    "Une erreur inattendue empêche l’accès à votre bibliothèque.",
    { cause: error },
  );
}

export function reportStorageError(error: unknown): BrainBookStorageError {
  const normalized = normalizeStorageError(error);

  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }

  return normalized;
}
