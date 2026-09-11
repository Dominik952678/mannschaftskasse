import { mitSupabase } from '../supabase/client'
import { lokalesRepository } from './lokalesRepository'
import { supabaseRepository } from './supabaseRepository'
import type { RepositoryFabrik } from './repository'

/** Supabase, sobald es konfiguriert ist — sonst die Kasse im Speicher. */
export const erzeugeRepository: RepositoryFabrik = (sitzung) =>
  mitSupabase ? supabaseRepository() : lokalesRepository(sitzung)
