// @vitest-environment jsdom

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { ReadingPreferencesRepository } from "@/storage/repositories/reading-preferences-repository";

describe("ReadingPreferencesRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("conserve la taille localement lorsque Supabase est indisponible", async () => {
    const repository = new ReadingPreferencesRepository(() => null);
    await repository.set("large");
    expect(repository.getCached()).toBe("large");
  });

  it("récupère la préférence du profil sur un nouvel appareil", async () => {
    const updateUser = vi.fn();
    const client = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: "90000000-0000-4000-8000-000000000000",
                user_metadata: { brainbook_reading_size: "compact" },
              },
            },
          },
        }),
        updateUser,
      },
    } as unknown as SupabaseClient<Database>;
    const repository = new ReadingPreferencesRepository(() => client);

    await expect(repository.reconcile()).resolves.toBe("compact");
    expect(repository.getCached()).toBe("compact");
    expect(updateUser).not.toHaveBeenCalled();
  });
});
