import { KATALOG_BY } from './katalog'
import { fmtBetrag, geburtstagKurz, heuteIso } from './format'
import type { Einheit, Gegner, Spiel, Spieler, Strafe } from './types'

/** Eine Strafe trifft mehrere: der Betrag gilt dann je Mann. */
export const istGeteilt = (s: Strafe) => s.spielerIds.length > 1

/** Was in der Liste steht: die Notiz, sonst der Katalogtext. */
export function bezeichnung(s: Strafe) {
  return s.notiz ?? KATALOG_BY[s.typId]?.kurz ?? s.typId
}

/** Betrag mit Einheit — bei geteilten Strafen mit dem Zusatz "je Mann". */
export function wert(s: Strafe) {
  const b = fmtBetrag(s.betrag, s.einheit)
  return istGeteilt(s) ? b + ' je Mann' : b
}

export function namen(spieler: Spieler[], ids: string[]) {
  return ids.map((id) => spieler.find((p) => p.id === id)?.name ?? '?').join(' + ')
}

export function summeOffen(strafen: Strafe[], einheit: Einheit, filter?: (s: Strafe) => boolean) {
  return strafen
    .filter((s) => s.einheit === einheit && s.status === 'offen' && (!filter || filter(s)))
    .reduce((a, s) => a + s.betrag, 0)
}

export type Stand = { eur: number; kiste: number }

/** Gesamtbilanz je Spieler — offen und bezahlt, für die Schandmauer. */
export function standProSpieler(strafen: Strafe[]): Record<string, Stand> {
  const out: Record<string, Stand> = {}
  strafen
    .filter((s) => s.status === 'offen' || s.status === 'bezahlt')
    .forEach((s) => s.spielerIds.forEach((id) => {
      if (!out[id]) out[id] = { eur: 0, kiste: 0 }
      out[id][s.einheit] += s.betrag
    }))
  return out
}

export type Posten = { text: string; betrag: string }
export type OffenerStand = { summe: number; posten: Posten[] }

/** Alles Offene einer Einheit, nach Spieler gebündelt — die Kassenliste. */
export function offenProSpieler(strafen: Strafe[], einheit: Einheit): Record<string, OffenerStand> {
  const out: Record<string, OffenerStand> = {}
  strafen
    .filter((s) => s.einheit === einheit && s.status === 'offen')
    .forEach((s) => s.spielerIds.forEach((id) => {
      if (!out[id]) out[id] = { summe: 0, posten: [] }
      out[id].summe += s.betrag
      out[id].posten.push({ text: bezeichnung(s) + ' · ' + kurzesDatum(s.datum), betrag: wert(s) })
    }))
  return out
}

function kurzesDatum(iso: string) {
  const [, m, d] = iso.split('-')
  return d + '.' + m + '.'
}

/** Das jüngste Spiel mit Ergebnis. */
export function letztesSpiel(spiele: Spiel[]): Spiel | null {
  return spiele
    .filter((s) => s.tore !== undefined && s.gegentore !== undefined)
    .sort((a, b) => b.datum.localeCompare(a.datum))[0] ?? null
}

/** Alle Spiele ohne Ergebnis, die noch nicht vorbei sind — das nächste zuerst. */
export function anstehendeSpiele(spiele: Spiel[]): Spiel[] {
  const heute = heuteIso()
  return spiele
    .filter((s) => s.tore === undefined && s.datum >= heute)
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.anstoss ?? '').localeCompare(b.anstoss ?? ''))
}

/** Das nächste Spiel ohne Ergebnis, das noch nicht vorbei ist. */
export function naechstesSpiel(spiele: Spiel[]): Spiel | null {
  return anstehendeSpiele(spiele)[0] ?? null
}

/** Das Logo zu einem Gegner — gefunden über den Namen, Groß/klein egal. */
export function logoFuer(gegner: Gegner[], name: string): string | undefined {
  const n = name.trim().toLowerCase()
  return gegner.find((g) => g.name.trim().toLowerCase() === n)?.logoUrl
}

export type GeburtstagInfo = { spieler: Spieler; datum: string; status: 'eingetragen' | 'fällig' | 'offen' }

/**
 * Geburtstage in Kalenderreihenfolge ab heute. Ein Geburtstag gilt als
 * eingetragen, sobald dafür eine Kiste in der Kasse steht.
 */
export function geburtstage(spieler: Spieler[], strafen: Strafe[]): GeburtstagInfo[] {
  const heute = heuteIso()
  const mmtt = heute.slice(5)
  const jahr = heute.slice(0, 4)

  const mitGeburtstag = spieler.filter((p) => !!p.geburtstag)

  return mitGeburtstag
    // Ab heute nach vorne, danach das, was dieses Jahr schon war.
    .sort((a, b) => sortSchluessel(a.geburtstag!, mmtt).localeCompare(sortSchluessel(b.geburtstag!, mmtt)))
    .map((p) => {
      // Im laufenden Jahr schon gebucht?
      const gebucht = strafen.some((s) =>
        s.typId === 'gebu' && s.spielerIds.includes(p.id)
        && s.status !== 'abgelehnt' && s.datum.startsWith(jahr))
      const vorbei = p.geburtstag! < mmtt
      return {
        spieler: p,
        datum: geburtstagKurz(p.geburtstag!),
        status: gebucht ? ('eingetragen' as const) : vorbei ? ('fällig' as const) : ('offen' as const),
      }
    })
}

const sortSchluessel = (mmtt: string, heute: string) => (mmtt < heute ? '1' : '0') + mmtt
