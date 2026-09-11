import { mitSupabase } from '../supabase/client'
import { lokalerAuth } from './lokalerAuth'
import { supabaseAuth } from './supabaseAuth'
import type { AuthAdapter } from './typen'

/** Supabase, sobald es konfiguriert ist — sonst der lokale Ersatz. */
export const auth: AuthAdapter = mitSupabase ? supabaseAuth : lokalerAuth
