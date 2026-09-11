import { supabase } from '../supabase/client'
import type { Rolle } from '../model/types'
import type { AnmeldeErgebnis, AuthAdapter, Profil, Sitzung } from './typen'

type SpielerZeile = { id: string; name: string; nummer: number | null; rolle: Rolle }

/** Antwort der RPC `spieler_verifizieren`. */
type VerifyAntwort =
  | { ok: true; spieler: SpielerZeile }
  | { ok: false; grund: 'falscher-code' | 'gesperrt' | 'unbekannt'; versuche_uebrig?: number; frei_ab?: string }

function client() {
  if (!supabase) throw new Error('Kein Supabase-Client — VITE_SUPABASE_URL fehlt.')
  return supabase
}

/**
 * Anmeldung über Supabase, in zwei Schritten:
 *
 * 1. Die App meldet sich anonym an. Damit gibt es ein echtes JWT und eine
 *    `auth.uid()`, an der die RLS-Policies hängen können.
 * 2. Der vierstellige Code geht an die Funktion `spieler_verifizieren`.
 *    Die prüft ihn gegen `spieler_geheim` (die Tabelle ist für den anon key
 *    unlesbar) und hängt bei Erfolg die anonyme Identität an
 *    genau dieses Spielerprofil. Ab da liefert `auth.uid()` die Rolle.
 *
 * Der Code verlässt den Client nur über diese eine Funktion, verglichen wird
 * er ausschließlich in der Datenbank.
 */
export const supabaseAuth: AuthAdapter = {
  quelle: 'supabase',

  async starten() {
    const sb = client()
    const { data } = await sb.auth.getSession()
    if (data.session) return
    const { error } = await sb.auth.signInAnonymously()
    if (error) throw error
  },

  async profile(): Promise<Profil[]> {
    const { data, error } = await client()
      .from('spieler_oeffentlich')
      .select('id, name, nummer, rolle')
      .order('name')
    if (error) throw error
    return (data ?? []).map((z: SpielerZeile) => ({
      id: z.id, name: z.name, nummer: z.nummer ?? undefined, rolle: z.rolle,
    }))
  },

  async anmelden(spielerId, code): Promise<AnmeldeErgebnis> {
    const { data, error } = await client().rpc('spieler_verifizieren', {
      p_spieler_id: spielerId,
      p_code: code,
    })
    if (error) {
      return { ok: false, grund: 'verbindung', text: 'Die Kasse antwortet nicht. Nochmal versuchen?' }
    }

    const antwort = data as VerifyAntwort
    if (antwort.ok) {
      const s = antwort.spieler
      return { ok: true, sitzung: { spielerId: s.id, name: s.name, rolle: s.rolle } }
    }

    if (antwort.grund === 'gesperrt') {
      return { ok: false, grund: 'gesperrt', text: 'Zu viele Fehlversuche. Gleich nochmal.', freiAb: antwort.frei_ab }
    }
    if (antwort.grund === 'unbekannt') {
      return { ok: false, grund: 'unbekannt', text: 'Das Profil gibt es nicht mehr.' }
    }
    const uebrig = antwort.versuche_uebrig ?? 0
    return {
      ok: false,
      grund: 'falscher-code',
      text: uebrig > 0 ? 'Falscher Code.' : 'Falscher Code. Das war der letzte Versuch.',
      versucheUebrig: uebrig,
    }
  },

  async sitzung(): Promise<Sitzung | null> {
    const { data, error } = await client().rpc('meine_sitzung')
    if (error || !data) return null
    const s = data as SpielerZeile
    return { spielerId: s.id, name: s.name, rolle: s.rolle }
  },

  async abmelden() {
    const sb = client()
    // Erst die Verknüpfung lösen, dann die anonyme Identität wegwerfen.
    await sb.rpc('spieler_abmelden')
    await sb.auth.signOut()
  },
}
