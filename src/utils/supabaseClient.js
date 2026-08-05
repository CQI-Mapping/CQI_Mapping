// Creates the single Supabase client used by every page and service.
// The keys come from .env (gitignored) so real secrets are never in source code.
// NOTE: we use the anon (public) key here — Row Level Security decides what each user can do.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
