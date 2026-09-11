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
      if (!speicher.daten.strafen.some((s) => s.id === strafeId)) {
        throw new Error('Diese Strafe gibt es nicht mehr.')
      }
      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.filter((s) => s.id !== strafeId),
      }
    },

    async spieltagAbrechnen({ gegner, datum, tore, gegentore, kaderIds }: SpieltagAbrechnung) {
      if (!darf.spieltagAbrechnen) throw new Error('Den Spieltag rechnet der Trainer ab.')

      // Die Tore zahlt der Trainer — auch wenn ein Admin abrechnet.
      const trainer = speicher.daten.spieler
        .filter((p) => p.rolle === 'Trainer' && p.aktiv !== false)
        .sort((a, b) => a.name.localeCompare(b.name))[0]
      if (tore > 0 && !trainer) throw new Error('Für die Tore fehlt ein Trainer im Kader.')

      const neu: Strafe[] = []
      if (gegentore > 0) kaderIds.forEach((id) => neu.push({
        id: neueId(), spielerIds: [id], typId: 'gegentor',
        betrag: gegentore * (KATALOG_BY.gegentor.satz ?? 0.5),
        einheit: 'eur', datum, status: 'offen',
        bestaetigtVon: [sitzung.spielerId], angelegtVon: sitzung.spielerId,
        notiz: gegentore + (gegentore === 1 ? ' Gegentor gg. ' : ' Gegentore gg. ') + gegner,
      }))
      if (tore > 0 && trainer) neu.push({
        id: neueId(), spielerIds: [trainer.id], typId: 'tor',
        betrag: tore * (KATALOG_BY.tor.satz ?? 1),
        einheit: 'eur', datum, status: 'offen',
        bestaetigtVon: [sitzung.spielerId], angelegtVon: sitzung.spielerId,
        notiz: tore + (tore === 1 ? ' Tor gg. ' : ' Tore gg. ') + gegner,
      })

      const bekannt = speicher.daten.spiele.find((s) => s.datum === datum && s.gegner === gegner)
      speicher.daten = {
        ...speicher.daten,
        strafen: speicher.daten.strafen.concat(neu),
        spiele: bekannt
          ? speicher.daten.spiele.map((s) => (s.id === bekannt.id ? { ...s, tore, gegentore } : s))
          : speicher.daten.spiele.concat([{ id: neueId(), datum, gegner, heim: true, tore, gegentore }]),
      }
    },
  }
}
