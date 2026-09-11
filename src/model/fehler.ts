/**
 * Der Text zu einem Fehler — gleich welcher Bauart.
 *
 * supabase-js gibt seine Fehler als schlichtes Objekt zurück
 * (`{ message, details, hint, code }`), nicht als `Error`. Ein
 * `instanceof Error` verschluckt damit genau die Meldung, die weiterhilft,
 * und übrig bleibt der Ersatztext. Deshalb fragt diese Funktion nach
 * `message`, nicht nach der Bauart.
 *
 * `hint` kommt zuerst: Postgres schreibt dort, was zu tun ist — bei
 * fehlenden Rechten sogar das nötige GRANT.
 */
export function fehlertext(e: unknown, ersatz: string): string {
  if (typeof e === 'object' && e !== null) {
    const f = e as { message?: unknown; hint?: unknown }
    const hinweis = typeof f.hint === 'string' ? f.hint.trim() : ''
    const meldung = typeof f.message === 'string' ? f.message.trim() : ''
    if (hinweis || meldung) return hinweis || meldung
  }
  return ersatz
}
