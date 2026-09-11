import type { Rolle } from '../model/types'

/** Was man vor dem Anmelden zu sehen bekommt: Name, Nummer, Rolle — sonst nichts. */
export type Profil = {
  id: string
  name: string
  nummer?: number
  rolle: Rolle
}

/** Wer angemeldet ist. Die Rolle daraus steuert die Berechtigungen. */
export type Sitzung = {
  spielerId: string
  name: string
  rolle: Rolle
}

export type AnmeldeGrund =
  | 'falscher-code'
  | 'gesperrt'
  | 'unbekannt'
  | 'verbindung'

export type AnmeldeErgebnis =
  | { ok: true; sitzung: Sitzung }
  | {
    ok: false
    grund: AnmeldeGrund
    text: string
    /** Bei 'falscher-code': wie viele Versuche bis zur Sperre bleiben. */
    versucheUebrig?: number
    /** Bei 'gesperrt': ab wann es wieder geht (ISO-Zeitstempel). */
    freiAb?: string
  }

/**
 * Die Anmeldung hinter einer Tür: lokal (ohne Backend) oder über Supabase.
 * Beide verhalten sich gleich — die App merkt keinen Unterschied.
 */
export interface AuthAdapter {
  readonly quelle: 'lokal' | 'supabase'
  /** Läuft einmal beim Start, bevor irgendetwas gelesen wird. */
  starten(): Promise<void>
  /** Die Profile zur Auswahl auf dem Anmeldeschirm. */
  profile(): Promise<Profil[]>
  /** Prüft den vierstelligen Code gegen genau dieses Profil. */
  anmelden(spielerId: string, code: string): Promise<AnmeldeErgebnis>
  /** Eine Sitzung, die den Reload überlebt hat — sonst null. */
  sitzung(): Promise<Sitzung | null>
  abmelden(): Promise<void>
}
