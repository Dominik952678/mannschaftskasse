import { ANFANGSDATEN } from './anfang'
import type { KasseDaten } from '../model/types'

/**
 * Der gemeinsame Speicher des lokalen Modus: Kasse, Codes und Sperren.
 * Anmeldung, Kasse und Verwaltung arbeiten darauf, so wie sie mit Supabase
 * auf dieselbe Datenbank schauen. Überlebt keinen Reload.
 */

export const SITZUNG_SCHLUESSEL = 'tsg-kasse.sitzung'
export const MAX_VERSUCHE = 5
export const SPERRE_MS = 15 * 60 * 1000

type Geheim = { code: string; fehlversuche: number; gesperrtBis?: number }

export function kopie(d: KasseDaten): KasseDaten {
  return {
    verein: { ...d.verein },
    spieler: d.spieler.map((p) => ({ ...p })),
    strafen: d.strafen.map((s) => ({ ...s, spielerIds: [...s.spielerIds], bestaetigtVon: [...s.bestaetigtVon] })),
    spiele: d.spiele.map((s) => ({ ...s, kader: s.kader && [...s.kader] })),
    gegner: d.gegner.map((g) => ({ ...g })),
  }
}

export const speicher = {
  daten: kopie(ANFANGSDATEN),
  geheim: new Map<string, Geheim>(),
  /** Per Verwaltung abgemeldet — gilt, bis sich der Spieler neu anmeldet. */
  abgemeldet: new Set<string>(),
}

/**
 * Würfelt einen Code, den noch niemand hat — nach denselben Regeln wie die
 * Datenbank: vier Ziffern, keine Allerweltscodes wie 1111 oder 1234.
 */
export function codeGenerieren(): string {
  const vergeben = new Set([...speicher.geheim.values()].map((g) => g.code))
  const zahl = new Uint32Array(1)
  for (let i = 0; i < 1000; i++) {
    crypto.getRandomValues(zahl)
    const code = String(zahl[0] % 10000).padStart(4, '0')
    if (/^(\d)\1{3}$/.test(code) || '0123456789'.includes(code) || '9876543210'.includes(code)) continue
    if (!vergeben.has(code)) return code
  }
  throw new Error('Keinen freien Code gefunden.')
}

for (const p of speicher.daten.spieler) {
  speicher.geheim.set(p.id, { code: codeGenerieren(), fehlversuche: 0 })
}

/** Wer in diesem Browser gerade angemeldet ist. */
export function lokaleSitzungId(): string | null {
  try {
    const roh = localStorage.getItem(SITZUNG_SCHLUESSEL)
    return roh ? (JSON.parse(roh) as { spielerId: string }).spielerId : null
  } catch {
    return null
  }
}
