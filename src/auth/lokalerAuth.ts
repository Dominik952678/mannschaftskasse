import { ANFANGSDATEN, ENTWICKLUNGS_CODE } from '../data/anfang'
import type { AnmeldeErgebnis, AuthAdapter, Profil, Sitzung } from './typen'

const SCHLUESSEL = 'tsg-kasse.sitzung'
const MAX_VERSUCHE = 5

let versuche = 0

/**
 * Anmeldung ohne Backend — für die Entwicklung und solange kein Supabase-
 * Projekt konfiguriert ist. Der Code steht im Klartext in `data/anfang.ts`;
 * echte Prüfung passiert nur serverseitig (siehe supabaseAuth).
 */
export const lokalerAuth: AuthAdapter = {
  quelle: 'lokal',

  async starten() {},

  async profile(): Promise<Profil[]> {
    return ANFANGSDATEN.spieler
      .filter((p) => p.aktiv !== false)
      .map((p) => ({ id: p.id, name: p.name, nummer: p.nummer, rolle: p.rolle }))
  },

  async anmelden(spielerId, code): Promise<AnmeldeErgebnis> {
    const p = ANFANGSDATEN.spieler.find((s) => s.id === spielerId)
    if (!p) return { ok: false, grund: 'unbekannt', text: 'Das Profil gibt es nicht mehr.' }

    if (versuche >= MAX_VERSUCHE) {
      return { ok: false, grund: 'gesperrt', text: 'Zu viele Versuche. Lade die Seite neu.' }
    }

    if (code !== ENTWICKLUNGS_CODE) {
      versuche += 1
      const uebrig = MAX_VERSUCHE - versuche
      return {
        ok: false,
        grund: 'falscher-code',
        text: uebrig > 0 ? 'Falscher Code.' : 'Falscher Code. Das war der letzte Versuch.',
        versucheUebrig: Math.max(0, uebrig),
      }
    }

    versuche = 0
    const sitzung: Sitzung = { spielerId: p.id, name: p.name, rolle: p.rolle }
    localStorage.setItem(SCHLUESSEL, JSON.stringify(sitzung))
    return { ok: true, sitzung }
  },

  async sitzung(): Promise<Sitzung | null> {
    try {
      const roh = localStorage.getItem(SCHLUESSEL)
      if (!roh) return null
      const s = JSON.parse(roh) as Sitzung
      // Nur gültig, solange es das Profil noch gibt.
      const p = ANFANGSDATEN.spieler.find((x) => x.id === s.spielerId)
      return p ? { spielerId: p.id, name: p.name, rolle: p.rolle } : null
    } catch {
      return null
    }
  },

  async abmelden() {
    versuche = 0
    localStorage.removeItem(SCHLUESSEL)
  },
}
