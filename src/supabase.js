import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

export const SUPABASE_URL = "https://tafotvohbwpuatgfeoqb.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dCmGxJEKQx8vJ059TS9jkQ_zveuazgj";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
