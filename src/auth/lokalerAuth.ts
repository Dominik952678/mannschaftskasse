import { ENTWICKLUNGS_CODE } from '../data/anfang'
import { MAX_VERSUCHE, SITZUNG_SCHLUESSEL, SPERRE_MS, speicher } from '../data/lokalerSpeicher'
import { sichtbareRolle } from '../model/spielerEingabe'
import type { AnmeldeErgebnis, AuthAdapter, Profil, Sitzung } from './typen'

/**
 * Anmeldung ohne Backend — für die Entwicklung und solange kein Supabase-
 * Projekt konfiguriert ist. Jeder Spieler hat einen eigenen Code (zu sehen
 * in der Verwaltung); zusätzlich gilt für alle der Entwicklungs-Code aus
 * `data/anfang.ts`, weil die Codes bei jedem Reload neu gewürfelt werden.
 */
export const lokalerAuth: AuthAdapter = {
  quelle: 'lokal',

  async starten() {},

  async profile(): Promise<Profil[]> {
    return speicher.daten.spieler
      .filter((p) => p.aktiv !== false)
      .map((p) => ({ id: p.id, name: p.name, nummer: p.nummer, rolle: sichtbareRolle(p.rolle) }))
  },

  async anmelden(spielerId, code): Promise<AnmeldeErgebnis> {
    const p = speicher.daten.spieler.find((s) => s.id === spielerId && s.aktiv !== false)
    const g = speicher.geheim.get(spielerId)
    if (!p || !g) return { ok: false, grund: 'unbekannt', text: 'Das Profil gibt es nicht mehr.' }

    if (g.gesperrtBis && g.gesperrtBis > Date.now()) {
      return {
        ok: false, grund: 'gesperrt', text: 'Zu viele Fehlversuche. Gleich nochmal.',
        freiAb: new Date(g.gesperrtBis).toISOString(),
      }
    }

    if (code !== g.code && code !== ENTWICKLUNGS_CODE) {
      g.fehlversuche += 1
      if (g.fehlversuche >= MAX_VERSUCHE) g.gesperrtBis = Date.now() + SPERRE_MS
      const uebrig = Math.max(0, MAX_VERSUCHE - g.fehlversuche)
      return {
        ok: false,
        grund: 'falscher-code',
        text: uebrig > 0 ? 'Falscher Code.' : 'Falscher Code. Das war der letzte Versuch.',
        versucheUebrig: uebrig,
      }
    }

    g.fehlversuche = 0
    g.gesperrtBis = undefined
    speicher.abgemeldet.delete(p.id)
    const sitzung: Sitzung = { spielerId: p.id, name: p.name, rolle: p.rolle }
    localStorage.setItem(SITZUNG_SCHLUESSEL, JSON.stringify(sitzung))
    return { ok: true, sitzung }
  },

  async sitzung(): Promise<Sitzung | null> {
    try {
      const roh = localStorage.getItem(SITZUNG_SCHLUESSEL)
      if (!roh) return null
      const s = JSON.parse(roh) as Sitzung
      // Nur gültig, solange es das Profil noch gibt und niemand es abgemeldet hat.
      const p = speicher.daten.spieler.find((x) => x.id === s.spielerId && x.aktiv !== false)
      if (!p || speicher.abgemeldet.has(p.id)) {
        localStorage.removeItem(SITZUNG_SCHLUESSEL)
        return null
      }
      return { spielerId: p.id, name: p.name, rolle: p.rolle }
    } catch {
      return null
    }
  },

  async abmelden() {
    localStorage.removeItem(SITZUNG_SCHLUESSEL)
  },
}
