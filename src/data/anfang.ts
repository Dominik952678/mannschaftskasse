import type { KasseDaten } from '../model/types'

/**
 * ── Startdaten für den lokalen Modus ─────────────────────────────────────
 *
 * Solange kein Supabase-Projekt konfiguriert ist (`.env.local`, siehe
 * `.env.example`), läuft die App gegen dieses Objekt: jede Liste zeigt ihren
 * Leerzustand, und was man eintippt, lebt bis zum Reload im Speicher.
 *
 * Mit Supabase kommen dieselben Daten aus der Datenbank — die Typen in
 * `model/types.ts` sind für beide Wege der Vertrag.
 *
 * Zum Befüllen reicht es, die Arrays auszufüllen:
 *
 *   spieler: [
 *     { id: 'p1', name: 'Julius Wagner', rolle: 'Spieler',
 *       position: 'Linkes Mittelfeld', nummer: 8, geburtstag: '03-14' },
 *     { id: 'p3', name: 'Dennis Möller', rolle: 'Kassenwart', nummer: 1 },
 *     { id: 'tr', name: 'Achim Kessler', rolle: 'Trainer' },
 *   ],
 *   spiele: [
 *     { id: 's1', datum: '2026-09-06', gegner: 'SG Neuwied II', heim: true,
 *       tore: 2, gegentore: 0 },
 *     { id: 's2', datum: '2026-09-13', gegner: 'FV Engers II', heim: false,
 *       anstoss: '14:30' },
 *   ],
 *   strafen: [
 *     { id: 'x1', spielerIds: ['p1'], typId: 'training', betrag: 5,
 *       einheit: 'eur', datum: '2026-09-04', status: 'offen',
 *       bestaetigtVon: [] },
 *   ],
 */
export const ANFANGSDATEN: KasseDaten = {
  verein: {
    name: 'TSG Irlich',
    mannschaft: 'Irlich I',
    saison: '25/26',
  },
  spieler: [],
  strafen: [],
  spiele: [],
}

/**
 * Der vierstellige Code im lokalen Modus — für alle Profile derselbe.
 * Mit Supabase hat jeder seinen eigenen, von der Datenbank gewürfelten Code,
 * und verglichen wird in der Datenbank; ein Code liegt dann nie im Browser.
 */
export const ENTWICKLUNGS_CODE = '1234'
