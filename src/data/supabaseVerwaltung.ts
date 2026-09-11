import { supabase } from '../supabase/client'
import { logoDateiname } from '../model/bild'
import type { KaderEintrag, Rolle, SpielDaten, SpielerDaten } from '../model/types'
import type { VerwaltungRepository } from './verwaltung'

type KaderZeile = {
  id: string; name: string; rolle: Rolle; nummer: number | null
  position: string | null; geburtstag: string | null; aktiv: boolean
  code: string | null; fehlversuche: number; gesperrt_bis: string | null; geraete: number
}

const BUCKET = 'gegner-logos'

function client() {
  if (!supabase) throw new Error('Kein Supabase-Client — VITE_SUPABASE_URL fehlt.')
  return supabase
}

/** Die Fehlermeldung der Datenbankfunktion, so wie sie dort formuliert ist. */
function fehler(e: { message: string }): Error {
  return new Error(e.message)
}

function alsJson(d: SpielerDaten) {
  return {
    name: d.name, rolle: d.rolle, nummer: d.nummer ?? null,
    position: d.position ?? null, geburtstag: d.geburtstag ?? null, aktiv: d.aktiv,
  }
}

/**
 * Verwaltung über die `admin_*`-Funktionen aus 0004_verwaltung.sql. Jede
 * prüft selbst, ob der Aufrufer Admin ist — die App verlässt sich nicht
 * darauf, dass sie den Knopf nur Admins zeigt.
 */
export function supabaseVerwaltung(): VerwaltungRepository {
  return {
    async kader() {
      const { data, error } = await client().rpc('admin_kader')
      if (error) throw fehler(error)
      return (data as KaderZeile[]).map((z): KaderEintrag => ({
        spieler: {
          id: z.id, name: z.name, rolle: z.rolle,
          nummer: z.nummer ?? undefined,
          position: z.position ?? undefined,
          geburtstag: z.geburtstag ?? undefined,
          aktiv: z.aktiv,
        },
        code: z.code ?? '',
        fehlversuche: z.fehlversuche,
        gesperrtBis: z.gesperrt_bis ?? undefined,
        geraete: z.geraete,
      }))
    },

    async anlegen(d) {
      const { data, error } = await client().rpc('admin_spieler_anlegen', { p_daten: alsJson(d) })
      if (error) throw fehler(error)
      return data as { id: string; code: string }
    },

    async aendern(id, d) {
      const { error } = await client().rpc('admin_spieler_aendern', { p_id: id, p_daten: alsJson(d) })
      if (error) throw fehler(error)
    },

    async loeschen(id, mitEintraegen) {
      const { data, error } = await client().rpc('admin_spieler_loeschen', {
        p_id: id,
        p_mit_eintraegen: mitEintraegen,
      })
      if (error) throw fehler(error)
      return (data as { eintraege: number }).eintraege
    },

    async codeNeu(id) {
      const { data, error } = await client().rpc('admin_code_neu', { p_id: id })
      if (error) throw fehler(error)
      return data as string
    },

    async sperreAufheben(id) {
      const { error } = await client().rpc('admin_sperre_aufheben', { p_id: id })
      if (error) throw fehler(error)
    },

    async geraeteAbmelden(id) {
      const { data, error } = await client().rpc('admin_geraete_abmelden', { p_id: id })
      if (error) throw fehler(error)
      return data as number
    },

    async spielSpeichern(id, d: SpielDaten) {
      const { data, error } = await client().rpc('admin_spiel_speichern', {
        p_id: id,
        p_daten: { datum: d.datum, anstoss: d.anstoss ?? null, gegner: d.gegner, heim: d.heim },
      })
      if (error) throw fehler(error)
      return data as string
    },

    async spielLoeschen(id) {
      const { error } = await client().rpc('admin_spiel_loeschen', { p_id: id })
      if (error) throw fehler(error)
    },

    // Erst hochladen, dann eintragen, dann das alte Logo wegräumen. Scheitert
    // das Eintragen, fliegt die frische Datei wieder raus.
    async logoSetzen(gegner, png) {
      const sb = client()
      const bucket = sb.storage.from(BUCKET)
      let pfad: string | null = null

      if (png) {
        pfad = logoDateiname(gegner)
        const { error } = await bucket.upload(pfad, png, {
          contentType: 'image/png',
          // Jeder Upload bekommt einen neuen Namen — die Datei ändert sich nie.
          cacheControl: '31536000',
          upsert: false,
        })
        if (error) throw new Error('Hochladen ging nicht: ' + error.message)
      }

      const { data: alt, error } = await sb.rpc('admin_gegner_logo', { p_name: gegner, p_pfad: pfad })
      if (error) {
        if (pfad) await bucket.remove([pfad])
        throw fehler(error)
      }
      if (typeof alt === 'string' && alt !== pfad) {
        // Aufräumen; klappt das nicht, bleibt nur eine verwaiste Datei liegen.
        await bucket.remove([alt])
      }
    },
  }
}
