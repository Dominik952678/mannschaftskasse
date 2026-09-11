import type { Rolle, Spieler, SpielerDaten } from './types'

export const ROLLEN: Rolle[] = ['Spieler', 'Kassenwart', 'Trainer', 'Admin']

/** Das Formular der Verwaltung — alles als Text, wie es aus den Feldern kommt. */
export type SpielerEingabe = {
  name: string
  rolle: Rolle
  nummer: string
  position: string
  /** "TT.MM." — so tippt man es; gespeichert wird "MM-TT". */
  geburtstag: string
  aktiv: boolean
}

export const LEERE_EINGABE: SpielerEingabe = {
  name: '', rolle: 'Spieler', nummer: '', position: '', geburtstag: '', aktiv: true,
}

export function alsEingabe(p: Spieler): SpielerEingabe {
  return {
    name: p.name,
    rolle: p.rolle,
    nummer: p.nummer !== undefined ? String(p.nummer) : '',
    position: p.position ?? '',
    geburtstag: p.geburtstag ? p.geburtstag.slice(3) + '.' + p.geburtstag.slice(0, 2) + '.' : '',
    aktiv: p.aktiv !== false,
  }
}

/**
 * Prüft das Formular und macht daraus Stammdaten. Die Meldungen sind
 * dieselben wie in der Datenbank (`admin_eingabe_pruefen`), damit es egal
 * ist, wer zuerst meckert.
 */
export function pruefeEingabe(e: SpielerEingabe): SpielerDaten {
  const name = e.name.trim()
  if (!name) throw new Error('Der Name fehlt.')

  const nummerText = e.nummer.trim()
  if (nummerText && !/^\d{1,2}$/.test(nummerText)) {
    throw new Error('Die Trikotnummer muss zwischen 0 und 99 liegen.')
  }

  let geburtstag: string | undefined
  const gebText = e.geburtstag.trim()
  if (gebText) {
    const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(gebText)
    const tag = m ? Number(m[1]) : 0
    const monat = m ? Number(m[2]) : 0
    if (!m || tag < 1 || tag > 31 || monat < 1 || monat > 12) {
      throw new Error('Geburtstag bitte als Tag und Monat, z. B. 14.03.')
    }
    geburtstag = String(monat).padStart(2, '0') + '-' + String(tag).padStart(2, '0')
  }

  return {
    name,
    rolle: e.rolle,
    nummer: nummerText ? Number(nummerText) : undefined,
    position: e.position.trim() || undefined,
    geburtstag,
    aktiv: e.aktiv,
  }
}

/** Andere sehen einen Admin als ganz normalen Spieler. */
export function sichtbareRolle(rolle: Rolle): Rolle {
  return rolle === 'Admin' ? 'Spieler' : rolle
}
