import type { UUID } from "@/domain/models";

export function createEntityId(): UUID {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "La génération d’UUID nécessite un navigateur moderne et un contexte sécurisé.",
    );
  }

  return globalThis.crypto.randomUUID() as UUID;
}
