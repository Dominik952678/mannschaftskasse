import { codeGenerieren, lokaleSitzungId, speicher } from './lokalerSpeicher'
import { berechtigungen } from '../model/berechtigungen'
import type { KaderEintrag, SpielDaten, SpielerDaten } from '../model/types'
import type { Sitzung } from '../auth/typen'
import type { VerwaltungRepository } from './verwaltung'

/** Verwaltung im Speicher des Browsers — dieselben Regeln wie in 0004_verwaltung.sql. */
export function lokaleVerwaltung(sitzung: Sitzung): VerwaltungRepository {
  function pruefen() {
    if (!berechtigungen(sitzung.rolle).verwalten) throw new Error('Das dürfen nur Admins.')
  }

  function nameFrei(name: string, ausser?: string) {
    if (speicher.daten.spieler.some((p) => p.name === name && p.id !== ausser)) {
      throw new Error(`Den Namen "${name}" gibt es schon.`)
    }
  }

  return {
    async kader(): Promise<KaderEintrag[]> {
      pruefen()
      const hier = lokaleSitzungId()
      return speicher.daten.spieler
        .map((p) => {
          const g = speicher.geheim.get(p.id)
          const gesperrt = g?.gesperrtBis && g.gesperrtBis > Date.now()
          return {
            spieler: { ...p },
            code: g?.code ?? '',
            fehlversuche: g?.fehlversuche ?? 0,
            gesperrtBis: gesperrt ? new Date(g.gesperrtBis!).toISOString() : undefined,
            // Lokal gibt es nur dieses eine Gerät.
            geraete: hier === p.id && !speicher.abgemeldet.has(p.id) ? 1 : 0,
          }
        })
        .sort((a, b) => Number(b.spieler.aktiv !== false) - Number(a.spieler.aktiv !== false)
          || a.spieler.name.localeCompare(b.spieler.name))
    },

    async anlegen(d: SpielerDaten) {
      pruefen()
      nameFrei(d.name)
      const id = crypto.randomUUID()
      const code = codeGenerieren()
      speicher.daten = { ...speicher.daten, spieler: speicher.daten.spieler.concat([{ id, ...d }]) }
      speicher.geheim.set(id, { code, fehlversuche: 0 })
      return { id, code }
    },

    async aendern(id: string, d: SpielerDaten) {
      pruefen()
      if (id === sitzung.spielerId && (d.rolle !== 'Admin' || !d.aktiv)) {
        throw new Error('Dich selbst kannst du nicht herabstufen oder austragen.')
      }
      if (!speicher.daten.spieler.some((p) => p.id === id)) throw new Error('Diesen Spieler gibt es nicht mehr.')
      nameFrei(d.name, id)
      speicher.daten = {
        ...speicher.daten,
        spieler: speicher.daten.spieler.map((p) => (p.id === id ? { id, ...d } : p)),
      }
    },

    async codeNeu(id: string) {
      pruefen()
      const code = codeGenerieren()
      speicher.geheim.set(id, { code, fehlversuche: 0 })
      return code
    },

    async sperreAufheben(id: string) {
      pruefen()
      const g = speicher.geheim.get(id)
      if (g) { g.fehlversuche = 0; g.gesperrtBis = undefined }
    },

    async geraeteAbmelden(id: string) {
      pruefen()
      if (id === sitzung.spielerId) throw new Error('Dich selbst meldest du im Profil ab.')
      const warDa = lokaleSitzungId() === id && !speicher.abgemeldet.has(id)
      speicher.abgemeldet.add(id)
      return warDa ? 1 : 0
    },

    async spielSpeichern(id: string | null, d: SpielDaten) {
      pruefen()
      const doppelt = speicher.daten.spiele.some((s) => s.id !== id && s.datum === d.datum && s.gegner === d.gegner)
      if (doppelt) throw new Error(`Gegen ${d.gegner} gibt es an dem Tag schon ein Spiel.`)

      const neueId = id ?? crypto.randomUUID()
      if (id && !speicher.daten.spiele.some((s) => s.id === id)) throw new Error('Dieses Spiel gibt es nicht mehr.')
      speicher.daten = {
        ...speicher.daten,
        spiele: id
          // Das Ergebnis bleibt, wie es ist — das trägt der Spieltag ein.
          ? speicher.daten.spiele.map((s) => (s.id === id ? { ...s, ...d } : s))
          : speicher.daten.spiele.concat([{ id: neueId, ...d }]),
        gegner: speicher.daten.gegner.some((g) => g.name === d.gegner)
          ? speicher.daten.gegner
          : speicher.daten.gegner.concat([{ name: d.gegner }]),
      }
      return neueId
    },

    async spielLoeschen(id: string) {
      pruefen()
      speicher.daten = { ...speicher.daten, spiele: speicher.daten.spiele.filter((s) => s.id !== id) }
    },

    async logoSetzen(gegner: string, png: Blob | null) {
      pruefen()
      const alt = speicher.daten.gegner.find((g) => g.name === gegner)?.logoUrl
      if (alt) URL.revokeObjectURL(alt)
      const logoUrl = png ? URL.createObjectURL(png) : undefined
      speicher.daten = {
        ...speicher.daten,
        gegner: speicher.daten.gegner.some((g) => g.name === gegner)
          ? speicher.daten.gegner.map((g) => (g.name === gegner ? { ...g, logoUrl } : g))
          : speicher.daten.gegner.concat([{ name: gegner, logoUrl }]),
      }
    },
  }
}
