import type { Katalogeintrag } from './types'

/**
 * Der Strafenkatalog der Mannschaft. Die ersten acht wählt man von Hand,
 * die letzten drei bucht die App selbst: Gegentore und Tore fallen beim
 * Abrechnen des Spieltags an, Geburtstage kommen aus dem Kalender.
 */
export const KATALOG: Katalogeintrag[] = [
  { id: 'training', label: 'Training geschwänzt', kurz: 'Training geschwänzt', einheit: 'eur', satz: 5, preis: '5 € unentschuldigt' },
  { id: 'spiel', label: 'Spiel geschwänzt', kurz: 'Spiel geschwänzt', einheit: 'eur', satz: 10, preis: '10 € unentschuldigt' },
  { id: 'dress', label: 'Falscher Dresscode', kurz: 'Falscher Dresscode', einheit: 'eur', satz: 5, preis: '5 €' },
  { id: 'spaet', label: 'Zu spät zum Spiel', kurz: 'Zu spät zum Spiel', einheit: 'eur', satz: null, preis: 'Trainer entscheidet' },
  { id: 'ball', label: '30+ Ballkontakte', kurz: '30+ Ballkontakte beim Aufwärmen', einheit: 'kiste', satz: 0.5, preis: '½ Kiste — die 2 in der Mitte', paar: true },
  { id: 'debut', label: 'Erstes Spiel', kurz: 'Erstes Spiel', einheit: 'kiste', satz: 1, preis: '1 Kiste' },
  { id: 'erstestor', label: 'Erstes Tor', kurz: 'Erstes Tor', einheit: 'kiste', satz: 1, preis: '1 Kiste' },
  { id: 'binde', label: 'Erstes Mal Binde', kurz: 'Erstes Mal Kapitänsbinde', einheit: 'kiste', satz: 1, preis: '1 Kiste' },

  { id: 'gegentor', label: 'Gegentor', kurz: 'Gegentor', einheit: 'eur', satz: 0.5, preis: '0,50 € pro Kaderspieler', automatisch: true, kader: true },
  { id: 'tor', label: 'Tor geschossen', kurz: 'Tor geschossen', einheit: 'eur', satz: 1, preis: '1 € — zahlt der Trainer', automatisch: true, trainer: true },
  { id: 'gebu', label: 'Geburtstag', kurz: 'Geburtstag', einheit: 'kiste', satz: 1, preis: '1 Kiste', automatisch: true },
]

/** Nur die Gründe, die man von Hand eintragen kann. */
export const KATALOG_WAEHLBAR = KATALOG.filter((k) => !k.automatisch)

export const KATALOG_BY: Record<string, Katalogeintrag> =
  Object.fromEntries(KATALOG.map((k) => [k.id, k]))
