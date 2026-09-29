import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AppConfig } from "../config";

export function createServerSupabaseClient(config: AppConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
