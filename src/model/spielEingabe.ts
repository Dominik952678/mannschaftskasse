import type { Spiel, SpielDaten } from './types'

/** Das Spielplan-Formular — alles als Text, wie es aus den Feldern kommt. */
export type SpielEingabe = {
  datum: string
  anstoss: string
  gegner: string
  heim: boolean
}

export const LEERES_SPIEL: SpielEingabe = { datum: '', anstoss: '', gegner: '', heim: true }

export function alsSpielEingabe(s: Spiel): SpielEingabe {
  return { datum: s.datum, anstoss: s.anstoss ?? '', gegner: s.gegner, heim: s.heim }
}

/** Dieselben Meldungen wie `admin_spiel_speichern` in der Datenbank. */
export function pruefeSpiel(e: SpielEingabe): SpielDaten {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum) || Number.isNaN(Date.parse(e.datum))) {
    throw new Error('Das Datum fehlt.')
  }
  const anstoss = e.anstoss.trim()
  if (anstoss && !/^\d{1,2}:\d{2}$/.test(anstoss)) throw new Error('Anstoß bitte als Uhrzeit, z. B. 15:00.')
  const gegner = e.gegner.trim()
  if (!gegner) throw new Error('Der Gegner fehlt.')
  if (gegner.length > 60) throw new Error('Der Gegnername ist zu lang.')
  return { datum: e.datum, anstoss: anstoss || undefined, gegner, heim: e.heim }
}
