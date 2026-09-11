/** Das Datenmodell der Mannschaftskasse. */

/**
 * Was jemand in der Kasse darf, hängt allein an dieser Rolle. Sie steht am
 * Spieler und kommt beim Anmelden mit — die Oberfläche richtet sich danach,
 * durchgesetzt wird sie in der Datenbank (siehe supabase/migrations).
 */
export type Rolle = 'Spieler' | 'Kassenwart' | 'Trainer'

/** Euro und Kisten laufen getrennt und werden nie ineinander umgerechnet. */
export type Einheit = 'eur' | 'kiste'

export type Status =
  /** Wartet auf zwei Stimmen oder den Kassenwart. */
  | 'antrag'
  /** Steht in der Kasse, ist aber noch nicht beglichen. */
  | 'offen'
  | 'bezahlt'
  | 'abgelehnt'

export type Spieler = {
  id: string
  name: string
  rolle: Rolle
  /** Trikotnummer. Trainer haben meist keine. */
  nummer?: number
  position?: string
  /** Geburtstag als "MM-TT" — das Jahr braucht die Kasse nicht. */
  geburtstag?: string
  /** Ausgetretene bleiben in der Kasse stehen, aber nicht in der Auswahl. */
  aktiv?: boolean
}

/** Ein Posten in der Kasse: eine Strafe gegen einen oder mehrere Spieler. */
export type Strafe = {
  id: string
  /** Mehr als einer heißt: geteilt, der Betrag gilt je Mann. */
  spielerIds: string[]
  /** Verweist auf einen Eintrag aus dem Strafenkatalog. */
  typId: string
  betrag: number
  einheit: Einheit
  /** ISO-Datum, "JJJJ-MM-TT". */
  datum: string
  status: Status
  /** Wer den Antrag bestätigt hat (Spieler-IDs). */
  bestaetigtVon: string[]
  angelegtVon?: string
  /** Überschreibt den Katalogtext, z. B. "2 Gegentore gg. SV Rengsdorf". */
  notiz?: string
}

export type Spiel = {
  id: string
  /** ISO-Datum, "JJJJ-MM-TT". */
  datum: string
  /** Anstoß als "14:30". */
  anstoss?: string
  gegner: string
  heim: boolean
  /** Solange kein Ergebnis eingetragen ist, gilt das Spiel als anstehend. */
  tore?: number
  gegentore?: number
}

export type Verein = {
  name: string
  mannschaft: string
  saison: string
}

/** Alles, was die App zum Anzeigen braucht. Wer eingeloggt ist, sagt die Sitzung. */
export type KasseDaten = {
  verein: Verein
  spieler: Spieler[]
  strafen: Strafe[]
  spiele: Spiel[]
}

/** Ein Eintrag aus dem Strafenkatalog: was es kostet und wie es gebucht wird. */
export type Katalogeintrag = {
  id: string
  label: string
  /** Langform für Listen und Anträge. */
  kurz: string
  einheit: Einheit
  /** `null` heißt: der Trainer legt den Betrag im Einzelfall fest. */
  satz: number | null
  preis: string
  /** Wird automatisch gebucht, taucht nicht in der Auswahl auf. */
  automatisch?: boolean
  /** Trifft den kompletten Spieltagskader. */
  kader?: boolean
  /** Zahlt der Trainer. */
  trainer?: boolean
  /** Genau zwei teilen sich eine Kiste. */
  paar?: boolean
}
