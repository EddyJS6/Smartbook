"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type SupabaseConfiguration =
  | { configured: false; reason: string }
  | { configured: true; url: string; publishableKey: string };

function readConfiguration(): SupabaseConfiguration {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!url || !publishableKey) {
    return {
      configured: false,
      reason:
        "Les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ne sont pas configurées.",
    };
  }

  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost"
    ) {
      throw new Error("Supabase doit utiliser HTTPS hors développement local.");
    }
  } catch {
    return {
      configured: false,
      reason: "NEXT_PUBLIC_SUPABASE_URL n’est pas une URL Supabase valide.",
    };
  }

  return { configured: true, url, publishableKey };
}

export const supabaseConfiguration = readConfiguration();

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseConfiguration.configured) return null;
  if (browserClient) return browserClient;

  browserClient = createClient<Database>(
    supabaseConfiguration.url,
    supabaseConfiguration.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
  return browserClient;
}
