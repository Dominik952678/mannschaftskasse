import { ANFANGSDATEN } from './anfang'
import { KATALOG_BY } from '../model/katalog'
import type { Einheit, KasseDaten, Strafe } from '../model/types'
import type { Sitzung } from '../auth/typen'
import type { KasseRepository, SpieltagAbrechnung, StrafeNeu } from './repository'

/**
 * Die Kasse im Speicher. Überlebt keinen Reload — genau richtig zum
 * Ausprobieren, solange kein Supabase-Projekt dranhängt.
 */
let daten: KasseDaten = strukturKopie(ANFANGSDATEN)

function strukturKopie(d: KasseDaten): KasseDaten {
  return {
    verein: { ...d.verein },
    spieler: d.spieler.map((p) => ({ ...p })),
    strafen: d.strafen.map((s) => ({ ...s, spielerIds: [...s.spielerIds], bestaetigtVon: [...s.bestaetigtVon] })),
    spiele: d.spiele.map((s) => ({ ...s })),
  }
}

const neueId = () => crypto.randomUUID()

export function lokalesRepository(sitzung: Sitzung): KasseRepository {
  const istKassenwart = sitzung.rolle === 'Kassenwart'
  const istTrainer = sitzung.rolle === 'Trainer'

  return {
    quelle: 'lokal',

    async laden() {
      return strukturKopie(daten)
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
        // Der Kassenwart bucht direkt, alle anderen stellen einen Antrag.
        status: istKassenwart ? 'offen' : 'antrag',
        bestaetigtVon: istKassenwart ? [sitzung.spielerId] : [],
        angelegtVon: sitzung.spielerId,
      }))
      daten = { ...daten, strafen: daten.strafen.concat(angelegt) }
    },

    async entscheiden(strafeId, bestaetigen) {
      if (!bestaetigen && !(istKassenwart || istTrainer)) {
        throw new Error('Ablehnen darf nur der Kassenwart oder der Trainer.')
      }
      daten = {
        ...daten,
        strafen: daten.strafen.map((s): Strafe => {
          if (s.id !== strafeId) return s
          if (!bestaetigen) return { ...s, status: 'abgelehnt' }
          if (istKassenwart) return { ...s, status: 'offen', bestaetigtVon: [sitzung.spielerId] }
          const stimmen = s.bestaetigtVon.includes(sitzung.spielerId)
            ? s.bestaetigtVon
            : s.bestaetigtVon.concat([sitzung.spielerId])
          return { ...s, bestaetigtVon: stimmen, status: stimmen.length >= 2 ? 'offen' : 'antrag' }
        }),
      }
    },

    async abhaken(spielerId: string, einheit: Einheit) {
      if (!istKassenwart) throw new Error('Abhaken darf nur der Kassenwart.')
      daten = {
        ...daten,
        strafen: daten.strafen.map((s): Strafe =>
          s.einheit === einheit && s.status === 'offen' && s.spielerIds.includes(spielerId)
            ? { ...s, status: 'bezahlt' }
            : s),
      }
    },

    async spieltagAbrechnen({ gegner, datum, tore, gegentore, kaderIds }: SpieltagAbrechnung) {
      if (!istTrainer) throw new Error('Den Spieltag rechnet der Trainer ab.')

      const neu: Strafe[] = []
      if (gegentore > 0) kaderIds.forEach((id) => neu.push({
        id: neueId(), spielerIds: [id], typId: 'gegentor',
        betrag: gegentore * (KATALOG_BY.gegentor.satz ?? 0.5),
        einheit: 'eur', datum, status: 'offen',
        bestaetigtVon: [sitzung.spielerId], angelegtVon: sitzung.spielerId,
        notiz: gegentore + (gegentore === 1 ? ' Gegentor gg. ' : ' Gegentore gg. ') + gegner,
      }))
      if (tore > 0) neu.push({
        id: neueId(), spielerIds: [sitzung.spielerId], typId: 'tor',
        betrag: tore * (KATALOG_BY.tor.satz ?? 1),
        einheit: 'eur', datum, status: 'offen',
        bestaetigtVon: [sitzung.spielerId], angelegtVon: sitzung.spielerId,
        notiz: tore + (tore === 1 ? ' Tor gg. ' : ' Tore gg. ') + gegner,
      })

      const bekannt = daten.spiele.find((s) => s.datum === datum && s.gegner === gegner)
      daten = {
        ...daten,
        strafen: daten.strafen.concat(neu),
        spiele: bekannt
          ? daten.spiele.map((s) => (s.id === bekannt.id ? { ...s, tore, gegentore } : s))
          : daten.spiele.concat([{ id: neueId(), datum, gegner, heim: true, tore, gegentore }]),
      }
    },
  }
}
