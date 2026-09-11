import type { Einheit, KasseDaten } from '../model/types'
import type { Sitzung } from '../auth/typen'

/** Eine Strafe, wie sie eingetragen wird — die IDs vergibt erst die Ablage. */
export type StrafeNeu = {
  spielerIds: string[]
  typId: string
  betrag: number
  einheit: Einheit
  /** ISO-Datum, "JJJJ-MM-TT". */
  datum: string
  notiz?: string
}

export type SpieltagAbrechnung = {
  gegner: string
  datum: string
  tore: number
  gegentore: number
  kaderIds: string[]
}

/**
 * Die Ablage der Kasse. Es gibt zwei: eine im Speicher des Browsers und eine
 * in Supabase. Die App kennt nur dieses Interface.
 *
 * Die schreibenden Methoden geben nichts zurück — der Store lädt danach neu.
 * Bei Supabase heißt das eine Runde mehr, dafür stimmt hinterher garantiert,
 * was auf dem Schirm steht (inklusive dem, was andere gebucht haben).
 */
export interface KasseRepository {
  readonly quelle: 'lokal' | 'supabase'
  laden(): Promise<KasseDaten>
  /** Ein Eintrag je Strafe; mehrere `spielerIds` heißen "geteilt". */
  strafenAnlegen(neu: StrafeNeu[]): Promise<void>
  entscheiden(strafeId: string, bestaetigen: boolean): Promise<void>
  /** Hakt alles Offene eines Spielers in einer Einheit als bezahlt ab. */
  abhaken(spielerId: string, einheit: Einheit): Promise<void>
  /**
   * Hakt einen einzelnen Posten ab — oder nimmt das Häkchen zurück.
   * Eine geteilte Strafe gilt damit für alle Beteiligten als bezahlt:
   * der Status hängt an der Strafe, nicht am einzelnen Mann.
   */
  bezahlen(strafeId: string, bezahlt: boolean): Promise<void>
  /** Nimmt einen Posten ganz raus. Endgültig — anders als 'abgelehnt'. */
  loeschen(strafeId: string): Promise<void>
  spieltagAbrechnen(abrechnung: SpieltagAbrechnung): Promise<void>
}

/** Wird mit der Sitzung gebaut: wer schreibt, steht damit fest. */
export type RepositoryFabrik = (sitzung: Sitzung) => KasseRepository
