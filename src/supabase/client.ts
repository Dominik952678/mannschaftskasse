import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Der Supabase-Client — oder `null`, solange keine Zugangsdaten gesetzt sind.
 * Ohne Konfiguration läuft die App im lokalen Modus weiter: alles im Speicher,
 * nichts geht raus. Siehe `.env.example`.
 */
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, {
    auth: {
      // Die Sitzung überlebt den Reload, damit niemand nach jedem Öffnen
      // wieder seinen Code tippen muss.
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null

export const mitSupabase = supabase !== null
