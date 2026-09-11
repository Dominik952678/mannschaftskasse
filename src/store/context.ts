import { createContext } from 'react'
import type { Berechtigungen } from '../model/berechtigungen'
import type { Einheit, KasseDaten, Rolle, Spieler, Strafe } from '../model/types'
import type { SpieltagAbrechnung } from '../data/repository'

export type Ladezustand = 'laedt' | 'bereit' | 'fehler'

export type KasseStore = {
  daten: KasseDaten
  ladezustand: Ladezustand
  ladefehler: string | null
  /** Eine Änderung ist unterwegs zur Ablage. */
  speichert: boolean
  neuLaden: () => void

  ich: Spieler | null
  kassenwart: Spieler | null
  trainer: Spieler | null
  rolle: Rolle
  /** Was diese Rolle darf — dieselben Regeln stehen als Policies in der DB. */
  darf: Berechtigungen

  spielerVonId: (id: string) => Spieler | null
  /** Trifft die Strafe die angemeldete Person? */
  betrifftMich: (s: Strafe) => boolean

  toast: string
  melde: (text: string) => void

  /** Legt je Spieler einen eigenen Posten an — oder einen geteilten. */
  strafenAnlegen: (spielerIds: string[], typId: string, betrag: number, geteilt?: boolean) => void
  entscheiden: (strafeId: string, bestaetigen: boolean) => void
  abhaken: (spielerId: string, einheit: Einheit) => void
  erinnern: (spielerId: string) => void
  spieltagAbrechnen: (abrechnung: SpieltagAbrechnung) => void
  zahlungMelden: (art: 'paypal' | 'bar') => void
  abmelden: () => void
}

export const KasseContext = createContext<KasseStore | null>(null)
