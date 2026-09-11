import { supabase } from '../supabase/client'
import type { Einheit, KasseDaten, Rolle, Spiel, Spieler, Status, Strafe } from '../model/types'
import type { KasseRepository, SpieltagAbrechnung, StrafeNeu } from './repository'

// ── Zeilen, wie sie aus PostgREST kommen ──────────────────────────────────

type VereinZeile = { name: string; mannschaft: string; saison: string }

type SpielerZeile = {
  id: string; name: string; rolle: Rolle; position: string | null
  nummer: number | null; geburtstag: string | null; aktiv: boolean
}

type StrafeZeile = {
  id: string; typ_id: string; betrag: number | string; einheit: Einheit
  datum: string; status: Status; angelegt_von: string | null; notiz: string | null
  strafe_spieler: { spieler_id: string }[]
  strafe_bestaetigungen: { spieler_id: string }[]
}

type SpielZeile = {
  id: string; datum: string; anstoss: string | null; gegner: string
  heim: boolean; tore: number | null; gegentore: number | null
}

function client() {
  if (!supabase) throw new Error('Kein Supabase-Client — VITE_SUPABASE_URL fehlt.')
  return supabase
}

function zuSpieler(z: SpielerZeile): Spieler {
  return {
    id: z.id, name: z.name, rolle: z.rolle,
    nummer: z.nummer ?? undefined,
    position: z.position ?? undefined,
    geburtstag: z.geburtstag ?? undefined,
    aktiv: z.aktiv,
  }
}

function zuStrafe(z: StrafeZeile): Strafe {
  return {
    id: z.id,
    spielerIds: z.strafe_spieler.map((v) => v.spieler_id),
    typId: z.typ_id,
    betrag: Number(z.betrag),
    einheit: z.einheit,
    datum: z.datum,
    status: z.status,
    bestaetigtVon: z.strafe_bestaetigungen.map((v) => v.spieler_id),
    angelegtVon: z.angelegt_von ?? undefined,
    notiz: z.notiz ?? undefined,
  }
}

function zuSpiel(z: SpielZeile): Spiel {
  return {
    id: z.id, datum: z.datum, gegner: z.gegner, heim: z.heim,
    // Postgres liefert "14:30:00" — die Sekunden braucht niemand.
    anstoss: z.anstoss ? z.anstoss.slice(0, 5) : undefined,
    tore: z.tore ?? undefined,
    gegentore: z.gegentore ?? undefined,
  }
}

/**
 * Die Kasse in Supabase.
 *
 * Gelesen wird direkt aus den Tabellen — dafür sorgen Lese-Policies, die
 * jedem angemeldeten Mitglied den Kader und die Kasse zeigen. Geschrieben
 * wird ausschließlich über Datenbankfunktionen: die prüfen die Rolle des
 * Aufrufers und tragen mehrere Tabellen in einem Rutsch ein. Die Tabellen
 * selbst nehmen vom anon key keine Schreibzugriffe an.
 *
 * Wer eingeloggt ist, sagt das JWT — deshalb braucht keine dieser Funktionen
 * eine Spieler-ID als Absender.
 */
export function supabaseRepository(): KasseRepository {
  return {
    quelle: 'supabase',

    async laden(): Promise<KasseDaten> {
      const sb = client()
      const [verein, spieler, strafen, spiele, gegner] = await Promise.all([
        sb.from('verein').select('name, mannschaft, saison').single(),
        // Über die View: Sie zeigt einen Admin als Spieler (0004_verwaltung.sql).
        sb.from('spieler_kader').select('id, name, rolle, position, nummer, geburtstag, aktiv').order('name'),
        sb.from('strafen').select(
          'id, typ_id, betrag, einheit, datum, status, angelegt_von, notiz,'
          + ' strafe_spieler(spieler_id), strafe_bestaetigungen(spieler_id)',
        ).order('datum', { ascending: false }),
        sb.from('spiele').select('id, datum, anstoss, gegner, heim, tore, gegentore').order('datum'),
        sb.from('gegner').select('name, logo_pfad'),
      ])

      const fehler = verein.error ?? spieler.error ?? strafen.error ?? spiele.error ?? gegner.error
      if (fehler) throw fehler

      // Ohne generierte Datenbanktypen kennt der Client die Form der Zeilen
      // nicht — die Zuordnung machen die `zu…`-Funktionen oben.
      return {
        verein: verein.data as unknown as VereinZeile,
        spieler: (spieler.data as unknown as SpielerZeile[]).map(zuSpieler),
        strafen: (strafen.data as unknown as StrafeZeile[]).map(zuStrafe),
        spiele: (spiele.data as unknown as SpielZeile[]).map(zuSpiel),
        // Logos liegen im öffentlichen Bucket — die Adresse lässt sich direkt bilden.
        gegner: (gegner.data as unknown as { name: string; logo_pfad: string | null }[]).map((g) => ({
          name: g.name,
          logoUrl: g.logo_pfad ? sb.storage.from('gegner-logos').getPublicUrl(g.logo_pfad).data.publicUrl : undefined,
        })),
      }
    },

    async strafenAnlegen(neu: StrafeNeu[]) {
      const { error } = await client().rpc('strafen_anlegen', {
        p_eintraege: neu.map((n) => ({
          spieler_ids: n.spielerIds,
          typ_id: n.typId,
          betrag: n.betrag,
          einheit: n.einheit,
          datum: n.datum,
          notiz: n.notiz ?? null,
        })),
      })
      if (error) throw error
    },

    async entscheiden(strafeId: string, bestaetigen: boolean) {
      const { error } = await client().rpc('strafe_entscheiden', {
        p_strafe_id: strafeId,
        p_bestaetigen: bestaetigen,
      })
      if (error) throw error
    },

    async abhaken(spielerId: string, einheit: Einheit) {
      const { error } = await client().rpc('strafen_abhaken', {
        p_spieler_id: spielerId,
        p_einheit: einheit,
      })
      if (error) throw error
    },

    async spieltagAbrechnen({ gegner, datum, tore, gegentore, kaderIds }: SpieltagAbrechnung) {
      const { error } = await client().rpc('spieltag_abrechnen', {
        p_gegner: gegner,
        p_datum: datum,
        p_tore: tore,
        p_gegentore: gegentore,
        p_kader: kaderIds,
      })
      if (error) throw error
    },
  }
}
