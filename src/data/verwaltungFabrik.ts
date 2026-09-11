import { mitSupabase } from '../supabase/client'
import { lokaleVerwaltung } from './lokaleVerwaltung'
import { supabaseVerwaltung } from './supabaseVerwaltung'
import type { VerwaltungFabrik } from './verwaltung'

export const erzeugeVerwaltung: VerwaltungFabrik = (sitzung) =>
  mitSupabase ? supabaseVerwaltung() : lokaleVerwaltung(sitzung)
