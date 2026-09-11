import type { Rolle } from './types'

/**
 * Was eine Rolle darf. Die Oberfläche blendet danach aus, was nicht geht —
 * verlassen darf man sich darauf nicht: dieselben Regeln stehen noch einmal
 * als RLS-Policies in der Datenbank (supabase/migrations/0001_schema.sql).
 * Diese Datei ist die Kopie fürs Auge, nicht der Türsteher.
 */
export type Berechtigungen = {
  /** Strafen vorschlagen darf jeder im Kader. */
  antragStellen: boolean
  /** Der Kassenwart trägt direkt ein, ohne den Umweg über den Antrag. */
  direktBuchen: boolean
  /** Anträge ablehnen darf, wer Kasse führt oder trainiert. */
  ablehnen: boolean
  /** Zahlungen abhaken darf nur, wer das Geld bekommt. */
  abhaken: boolean
  erinnern: boolean
  /** Den Spieltag rechnet der Trainer ab. */
  spieltagAbrechnen: boolean
}

export function berechtigungen(rolle: Rolle): Berechtigungen {
  const kassenwart = rolle === 'Kassenwart'
  const trainer = rolle === 'Trainer'
  return {
    antragStellen: true,
    direktBuchen: kassenwart,
    ablehnen: kassenwart || trainer,
    abhaken: kassenwart,
    erinnern: kassenwart,
    spieltagAbrechnen: trainer,
  }
}
