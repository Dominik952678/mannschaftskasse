/** Formatierung — deutsch, knapp, ohne Bibliothek. */

export function fmtEur(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €'
}

export function fmtKiste(n: number) {
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
  return s + (n === 1 ? ' Kiste' : ' Kisten')
}

export function fmtBetrag(n: number, einheit: 'eur' | 'kiste') {
  return einheit === 'eur' ? fmtEur(n) : fmtKiste(n)
}

/** Kistenstände ohne Einheit, für die große Kachel auf der Startseite. */
export function fmtKistenZahl(n: number) {
  return String(n).replace('.', ',')
}

export function initialen(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/** Vereinskürzel aus einem Gegnernamen: "FV Engers II" → "FVE". */
export function kuerzel(name: string) {
  return (name.match(/[A-ZÄÖÜ]/g) ?? []).join('').slice(0, 3) || '?'
}

export function vorname(name: string) {
  return name.split(' ')[0]
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** "2026-09-14" → "14.09." */
export function tagKurz(iso: string) {
  const [, m, d] = iso.split('-')
  return d + '.' + m + '.'
}

/** "2026-09-14" → "Mo 14.09." */
export function tagMitWochentag(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return WOCHENTAGE[d.getDay()] + ' ' + tagKurz(iso)
}

/** "09-14" → "14.09." */
export function geburtstagKurz(mmtt: string) {
  const [m, d] = mmtt.split('-')
  return d + '.' + m + '.'
}

/** Heute als ISO-Datum, in lokaler Zeit. */
export function heuteIso() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
