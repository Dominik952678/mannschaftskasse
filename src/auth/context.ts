import { createContext } from 'react'
import type { AnmeldeErgebnis, Profil, Sitzung } from './typen'

export type AuthStatus =
  /** Verbindung wird aufgebaut, Profile werden geholt. */
  | 'startet'
  | 'abgemeldet'
  | 'angemeldet'
  /** Die Kasse ist nicht erreichbar. */
  | 'fehler'

export type AuthKontext = {
  status: AuthStatus
  sitzung: Sitzung | null
  profile: Profil[]
  fehler: string | null
  quelle: 'lokal' | 'supabase'
  anmelden: (spielerId: string, code: string) => Promise<AnmeldeErgebnis>
  abmelden: () => Promise<void>
  /** Nach einem Verbindungsfehler noch einmal versuchen. */
  nochmal: () => void
}

export const AuthContext = createContext<AuthKontext | null>(null)
