import { createContext } from 'react'
import type { Berechtigungen } from '../model/berechtigungen'
import type { Einheit, KasseDaten, Rolle, Spieler, Strafe } from '../model/types'
import type { SpieltagAbrechnung } from '../data/repository'

export type Ladezustand = 'laedt' | 'bereit' | 'fehler'

/** Kurze Rückmeldung unten am Schirm. `rueckgaengig` blendet einen Knopf ein. */
export type Toast = { text: string; rueckgaengig?: () => void }

export type KasseStore = {
  daten: KasseDaten
  ladezustand: Ladezustand
  ladefehler: string | null
  /** Eine Änderung ist unterwegs zur Ablage. */
  speichert: boolean
  neuLaden: () => void
  /** Lädt still neu, ohne Ladebildschirm — etwa nach Änderungen in der Verwaltung. */
  aktualisieren: () => Promise<void>

  ich: Spieler | null
  kassenwart: Spieler | null
  trainer: Spieler | null
  rolle: Rolle
  /** Was diese Rolle darf — dieselben Regeln stehen als Policies in der DB. */
  darf: Berechtigungen

  spielerVonId: (id: string) => Spieler | null
  /** Trifft die Strafe die angemeldete Person? */
  betrifftMich: (s: Strafe) => boolean

  /** Was gerade unten eingeblendet ist — samt Rückweg, wo es einen gibt. */
  toast: Toast | null
  melde: (text: string, rueckgaengig?: () => void) => void

  /** Legt je Spieler einen eigenen Posten an — oder einen geteilten. */
  strafenAnlegen: (spielerIds: string[], typId: string, betrag: number, geteilt?: boolean) => void
  entscheiden: (strafeId: string, bestaetigen: boolean) => void
  abhaken: (spielerId: string, einheit: Einheit) => void
  /** Einen einzelnen Posten abhaken — oder das Häkchen zurücknehmen. */
  bezahlen: (strafeId: string, bezahlt: boolean) => void
  /** Einen Posten ganz rausnehmen. Endgültig. */
  loeschen: (strafeId: string) => void
  erinnern: (spielerId: string) => void
  spieltagAbrechnen: (abrechnung: SpieltagAbrechnung) => void
  zahlungMelden: (art: 'paypal' | 'bar') => void
  abmelden: () => void
}

export const KasseContext = createContext<KasseStore | null>(null)
