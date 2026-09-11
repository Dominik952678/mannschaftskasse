import type { KaderEintrag, SpielDaten, SpielerDaten } from '../model/types'
import type { Sitzung } from '../auth/typen'

/**
 * Die Verwaltung des Kaders — nur für Admins. Wie beim Kassen-Repository
 * gibt es eine lokale Fassung und eine für Supabase; die Rechte prüfen beide
 * selbst, die Datenbank zusätzlich in jeder Funktion.
 */
export interface VerwaltungRepository {
  /** Alle Spieler, mit echter Rolle, Code, Sperre und Geräten. */
  kader(): Promise<KaderEintrag[]>
  /** Legt an und gibt den frisch gewürfelten Code zurück. */
  anlegen(daten: SpielerDaten): Promise<{ id: string; code: string }>
  aendern(id: string, daten: SpielerDaten): Promise<void>
  /**
   * Löscht einen Spieler endgültig. Hat er Einträge in der Kasse, verweigert
   * die Ablage das — bis `mitEintraegen` ausdrücklich gesetzt ist; dann gehen
   * Strafen, die nur ihn betrafen, mit raus. Gibt zurück, wie viele es waren.
   * Für jemanden, dessen Historie bleiben soll, ist `aktiv: false` der Weg.
   */
  loeschen(id: string, mitEintraegen: boolean): Promise<number>
  /** Neuer Code; der alte gilt ab sofort nicht mehr. Hebt eine Sperre auf. */
  codeNeu(id: string): Promise<string>
  sperreAufheben(id: string): Promise<void>
  /** Meldet auf allen Geräten ab und gibt zurück, wie viele es waren. */
  geraeteAbmelden(id: string): Promise<number>

  /** Legt ein Spiel an (`id` null) oder ändert es; das Ergebnis bleibt. */
  spielSpeichern(id: string | null, daten: SpielDaten): Promise<string>
  /** Abgerechnete Strafen bleiben stehen. */
  spielLoeschen(id: string): Promise<void>
  /** Setzt das Logo eines Gegners (fertiges PNG) oder entfernt es mit `null`. */
  logoSetzen(gegner: string, png: Blob | null): Promise<void>
}

export type VerwaltungFabrik = (sitzung: Sitzung) => VerwaltungRepository
