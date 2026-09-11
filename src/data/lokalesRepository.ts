import { kopie, speicher } from './lokalerSpeicher'
import { berechtigungen } from '../model/berechtigungen'
import { KATALOG_BY } from '../model/katalog'
import { sichtbareRolle } from '../model/spielerEingabe'
import type { Einheit, Strafe } from '../model/types'
import type { Sitzung } from '../auth/typen'
import type { KasseRepository, SpieltagAbrechnung, StrafeNeu } from './repository'

/**
 * Die Kasse im Speicher des Browsers (siehe lokalerSpeicher). Überlebt keinen
 * Reload — genau richtig zum Ausprobieren, solange kein Supabase dranhängt.
 */
const neueId = () => crypto.randomUUID()

export function lokalesRepository(sitzung: Sitzung): KasseRepository {
  // Dieselben Regeln wie in der Datenbank (`darf()`), damit sich beide
  // Modi gleich verhalten.
  const darf = berechtigungen(sitzung.rolle)

  return {
    quelle: 'lokal',

    async laden() {
      // Wie die Datenbank: Andere sehen einen Admin als Spieler.
      const d = kopie(speicher.daten)
      d.spieler = d.spieler.map((p) => ({ ...p, rolle: sichtbareRolle(p.rolle) }))
      return d
    },

    async strafenAnlegen(neu: StrafeNeu[]) {
      const angelegt: Strafe[] = neu.map((n) => ({
        id: neueId(),
        spielerIds: [...n.spielerIds],
        typId: n.typId,
        betrag: n.betrag,
        einheit: n.einheit,
        datum: n.datum,
        notiz: n.notiz,
        // Kassenwart und Admin buchen direkt, alle anderen stellen einen Antrag.
        status: darf.direktBuchen ? 'offen' : 'antrag',
        bestaetigtVon: darf.direktBuchen ? [sitzung.spielerId] : [],
        angelegtVon: sitzung.spielerId,
      }))
      speicher.daten = { ...speicher.daten, strafen: speicher.daten.strafen.concat(angelegt) }
    },

    async entscheiden(strafeId, bestaetigen) {
      if (!bestaetigen && !darf.ablehnen) {
        throw new Error('Ablehnen darf nur der Kassenwart oder der Trainer.')
      }
      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.map((s): Strafe => {
          if (s.id !== strafeId) return s
          if (!bestaetigen) return { ...s, status: 'abgelehnt' }
          if (darf.direktBuchen) return { ...s, status: 'offen', bestaetigtVon: [sitzung.spielerId] }
          const stimmen = s.bestaetigtVon.includes(sitzung.spielerId)
            ? s.bestaetigtVon
            : s.bestaetigtVon.concat([sitzung.spielerId])
          return { ...s, bestaetigtVon: stimmen, status: stimmen.length >= 2 ? 'offen' : 'antrag' }
        }),
      }
    },

    async abhaken(spielerId: string, einheit: Einheit) {
      if (!darf.abhaken) throw new Error('Abhaken darf nur der Kassenwart.')
      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.map((s): Strafe =>
          s.einheit === einheit && s.status === 'offen' && s.spielerIds.includes(spielerId)
            ? { ...s, status: 'bezahlt' }
            : s),
      }
    },

    async bezahlen(strafeId: string, bezahlt: boolean) {
      if (!darf.abhaken) throw new Error('Abhaken darf nur der Kassenwart.')
      const vorher = speicher.daten.strafen.find((s) => s.id === strafeId)
      if (!vorher) throw new Error('Diese Strafe gibt es nicht mehr.')
      if (bezahlt && vorher.status !== 'offen') throw new Error('Nur offene Posten lassen sich abhaken.')
      if (!bezahlt && vorher.status !== 'bezahlt') throw new Error('Dieser Posten steht nicht als bezahlt.')

      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.map((s): Strafe =>
          s.id === strafeId ? { ...s, status: bezahlt ? 'bezahlt' : 'offen' } : s),
      }
    },

    async loeschen(strafeId: string) {
      if (!darf.loeschen) throw new Error('Rausnehmen darf nur der Kassenwart.')
      const weg = speicher.daten.strafen.find((s) => s.id === strafeId)
      if (!weg) throw new Error('Diese Strafe gibt es nicht mehr.')

      // Ein Gegentor-Posten gehört zu einem Mann im Spieltagskader — wer ihn
      // rausnimmt, nimmt den Mann aus dem Kader (wie strafe_loeschen in 0008).
      const ausDemKader = weg.typId === 'gegentor' && weg.spielId ? weg.spielerIds[0] : undefined
      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.filter((s) => s.id !== strafeId),
        spiele: speicher.daten.spiele.map((s) => (s.id === weg.spielId && ausDemKader
          ? { ...s, kader: s.kader?.filter((id) => id !== ausDemKader) }
          : s)),
      }
    },

    async spieltagAbrechnen({ spielId, tore, gegentore, kaderIds }: SpieltagAbrechnung) {
      if (!darf.spieltagAbrechnen) throw new Error('Den Spieltag rechnet der Trainer ab.')
      if (tore < 0 || gegentore < 0) throw new Error('Das Ergebnis stimmt so nicht.')
      const kader = [...new Set(kaderIds)]
      if (!kader.length) throw new Error('Ohne Kader keine Abrechnung.')
      if (kader.some((id) => !speicher.daten.spieler.some((p) => p.id === id))) {
        throw new Error('Einen aus dem Kader gibt es nicht mehr.')
      }
      const spiel = speicher.daten.spiele.find((s) => s.id === spielId)
      if (!spiel) throw new Error('Dieses Spiel gibt es nicht mehr.')

      const betragGeg = gegentore * (KATALOG_BY.gegentor.satz ?? 0.5)
      const betragTor = tore * (KATALOG_BY.tor.satz ?? 1)
      const notizGeg = gegentore + (gegentore === 1 ? ' Gegentor gg. ' : ' Gegentore gg. ') + spiel.gegner
      const notizTor = tore + (tore === 1 ? ' Tor gg. ' : ' Tore gg. ') + spiel.gegner

      // Wie in der Datenbank: Wer dabei bleibt, behält seinen Posten samt
      // Status. Je Mann bleibt einer — ein bezahlter zuerst.
      const alt = speicher.daten.strafen
      const vomSpiel = (typId: string) => alt
        .filter((s) => s.spielId === spielId && s.typId === typId)
        .sort((a, b) => Number(b.status === 'bezahlt') - Number(a.status === 'bezahlt'))
      const gegentorPosten = new Map<string, Strafe>()
      if (gegentore > 0) {
        for (const s of vomSpiel('gegentor')) {
          const id = s.spielerIds[0]
          if (kader.includes(id) && !gegentorPosten.has(id)) gegentorPosten.set(id, s)
        }
      }
      const torPosten = tore > 0 ? vomSpiel('tor')[0] : undefined
      const bleibt = new Set([...gegentorPosten.values(), torPosten].filter((s) => s !== undefined).map((s) => s.id))

      // Die Tore zahlt der Trainer — auch wenn ein Admin abrechnet.
      const trainer = speicher.daten.spieler
        .filter((p) => p.rolle === 'Trainer' && p.aktiv !== false)
        .sort((a, b) => a.name.localeCompare(b.name))[0]
      if (tore > 0 && !torPosten && !trainer) throw new Error('Für die Tore fehlt ein Trainer im Kader.')

      const posten = (typId: string, spielerId: string, betrag: number, notiz: string): Strafe => ({
        id: neueId(), spielerIds: [spielerId], typId, betrag,
        einheit: 'eur', datum: spiel.datum, status: 'offen',
        bestaetigtVon: [sitzung.spielerId], angelegtVon: sitzung.spielerId,
        notiz, spielId,
      })
      const neu: Strafe[] = []
      if (gegentore > 0) kader.forEach((id) => {
        if (!gegentorPosten.has(id)) neu.push(posten('gegentor', id, betragGeg, notizGeg))
      })
      if (tore > 0 && !torPosten && trainer) neu.push(posten('tor', trainer.id, betragTor, notizTor))

      speicher.daten = {
        ...speicher.daten,
        strafen: alt
          .filter((s) => s.spielId !== spielId || (s.typId !== 'gegentor' && s.typId !== 'tor') || bleibt.has(s.id))
          .map((s): Strafe => {
            if (!bleibt.has(s.id)) return s
            return s.typId === 'tor'
              ? { ...s, betrag: betragTor, notiz: notizTor, datum: spiel.datum }
              : { ...s, betrag: betragGeg, notiz: notizGeg, datum: spiel.datum }
          })
          .concat(neu),
        spiele: speicher.daten.spiele.map((s) => (s.id === spielId ? { ...s, tore, gegentore, kader } : s)),
      }
    },
  }
}
