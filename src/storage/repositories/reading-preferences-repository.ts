"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseClient } from "@/lib/supabase/client";

export type ReadingSize = "compact" | "comfortable" | "large";

const LAST_SIZE_KEY = "brainbook:reading-size:last";
const LOCAL_DIRTY_KEY = "brainbook:reading-size:local:dirty";
const PROFILE_FIELD = "brainbook_reading_size";

function isReadingSize(value: unknown): value is ReadingSize {
  return (
    value === "compact" || value === "comfortable" || value === "large"
  );
}

function userSizeKey(userId: string) {
  return `brainbook:reading-size:${userId}`;
}

function userDirtyKey(userId: string) {
  return `brainbook:reading-size:${userId}:dirty`;
}

function emitPreferenceChanged(size: ReadingSize) {
  window.dispatchEvent(
    new CustomEvent("brainbook:reading-preferences", { detail: { size } }),
  );
}

export class ReadingPreferencesRepository {
  constructor(
    private readonly clientFactory: () => SupabaseClient<Database> | null,
  ) {}

  getCached(): ReadingSize {
    if (typeof window === "undefined") return "comfortable";
    const value = window.localStorage.getItem(LAST_SIZE_KEY);
    return isReadingSize(value) ? value : "comfortable";
  }

  private store(size: ReadingSize, userId?: string) {
    window.localStorage.setItem(LAST_SIZE_KEY, size);
    if (userId) window.localStorage.setItem(userSizeKey(userId), size);
    emitPreferenceChanged(size);
  }

  async reconcile(): Promise<ReadingSize> {
    const localSize = this.getCached();
    const client = this.clientFactory();
    if (!client) return localSize;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return localSize;

    const userId = session.user.id;
    const userCached = window.localStorage.getItem(userSizeKey(userId));
    const preferredLocalSize = isReadingSize(userCached)
      ? userCached
      : localSize;
    const localIsDirty =
      window.localStorage.getItem(LOCAL_DIRTY_KEY) === "1" ||
      window.localStorage.getItem(userDirtyKey(userId)) === "1";

    if (localIsDirty) {
      const { error } = await client.auth.updateUser({
        data: { [PROFILE_FIELD]: preferredLocalSize },
      });
      if (error) throw error;
      window.localStorage.removeItem(LOCAL_DIRTY_KEY);
      window.localStorage.removeItem(userDirtyKey(userId));
      this.store(preferredLocalSize, userId);
      return preferredLocalSize;
    }

    const remoteSize = session.user.user_metadata?.[PROFILE_FIELD];
    if (isReadingSize(remoteSize)) {
      this.store(remoteSize, userId);
      return remoteSize;
    }

    const { error } = await client.auth.updateUser({
      data: { [PROFILE_FIELD]: preferredLocalSize },
    });
    if (error) throw error;
    this.store(preferredLocalSize, userId);
    return preferredLocalSize;
  }

  async set(size: ReadingSize): Promise<void> {
    this.store(size);
    const client = this.clientFactory();
    if (!client) {
      window.localStorage.setItem(LOCAL_DIRTY_KEY, "1");
      return;
    }
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      window.localStorage.setItem(LOCAL_DIRTY_KEY, "1");
      return;
    }

    const userId = session.user.id;
    this.store(size, userId);
    window.localStorage.setItem(userDirtyKey(userId), "1");
    if (!navigator.onLine) return;

    const { error } = await client.auth.updateUser({
      data: { [PROFILE_FIELD]: size },
    });
    if (error) throw error;
    window.localStorage.removeItem(userDirtyKey(userId));
    window.localStorage.removeItem(LOCAL_DIRTY_KEY);
  }
}

export const readingPreferencesRepository =
  new ReadingPreferencesRepository(getSupabaseClient);
