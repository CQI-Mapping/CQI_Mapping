// Creates the single Supabase client used by every page and service.
// The keys come from .env (gitignored) so real secrets are never in source code.
// NOTE: we use the anon (public) key here — Row Level Security decides what each user can do.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True only when both keys were inlined at build time. On Vercel this is false
// if the env vars are missing from the project settings — main.jsx then shows a
// readable "not configured" screen instead of a silent white page.
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// createClient throws on undefined input, so only build the client when configured.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
