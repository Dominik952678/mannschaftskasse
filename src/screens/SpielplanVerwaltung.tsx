import { useEffect, useState } from 'react'
import { GegnerLogo } from '../components/GegnerLogo'
import { Karte, Leer, Sektion, Tappable, Zurueck } from '../components/ui'
import { logoFuer } from '../model/berechnung'
import { logoVorbereiten } from '../model/bild'
import { heuteIso, kuerzel, tagMitWochentag } from '../model/format'
import { alsSpielEingabe, LEERES_SPIEL, pruefeSpiel } from '../model/spielEingabe'
import type { SpielEingabe } from '../model/spielEingabe'
import type { Spiel, SpielDaten } from '../model/types'
import { useKasse } from '../store/useKasse'

// ── Liste ─────────────────────────────────────────────────────────────────

export function SpielplanListe({ neu, oeffnen }: { neu: () => void; oeffnen: (id: string) => void }) {
  const { daten } = useKasse()
  const heute = heuteIso()
  const kommend = daten.spiele
    .filter((s) => s.datum >= heute)
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.anstoss ?? '').localeCompare(b.anstoss ?? ''))
  const vergangen = daten.spiele
    .filter((s) => s.datum < heute)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 8)

  return (
    <>
      <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15, marginTop: 0 }} onClick={neu}>
        Spiel hinzufügen
      </button>

      <Sektion titel="Kommende Spiele" hinweis={kommend.length ? 'sehen alle auf der Startseite' : undefined}>
        {kommend.length === 0
          ? <Leer dicht>Noch kein Spiel eingetragen.</Leer>
          : kommend.map((s) => <SpielZeile key={s.id} spiel={s} oeffnen={oeffnen} />)}
      </Sektion>

      {vergangen.length > 0 && (
        <Sektion titel="Gespielt" hinweis="die letzten acht">
          {vergangen.map((s) => <SpielZeile key={s.id} spiel={s} oeffnen={oeffnen} />)}
        </Sektion>
      )}

      <div className="note" style={{ fontSize: 12, lineHeight: 1.45 }}>
        Das Logo gehört zum Gegner, nicht zum Spiel: einmal hochgeladen, steht es bei
        jedem weiteren Spiel gegen ihn schon da.
      </div>
    </>
  )
}

function SpielZeile({ spiel, oeffnen }: { spiel: Spiel; oeffnen: (id: string) => void }) {
  const ergebnis = spiel.tore !== undefined && spiel.gegentore !== undefined ? `${spiel.tore}:${spiel.gegentore}` : null
  const zusatz = [
    tagMitWochentag(spiel.datum),
    spiel.anstoss ? spiel.anstoss + ' Uhr' : null,
    spiel.heim ? 'Heim' : 'Auswärts',
  ].filter(Boolean).join(' · ')

  return (
    <Tappable
      className="rule-b hover-neutral-200"
      onClick={() => oeffnen(spiel.id)}
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 4px' }}
    >
      <GegnerLogo name={spiel.gegner} groesse={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="zeile-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spiel.gegner}</div>
        <div className="note">{zusatz}</div>
      </div>
      {ergebnis && <span className="cond" style={{ fontSize: 18, flex: 'none' }}>{ergebnis}</span>}
      <span aria-hidden style={{ fontSize: 20, color: 'var(--color-neutral-400)' }}>›</span>
    </Tappable>
  )
}

// ── Anlegen und ändern ────────────────────────────────────────────────────

type LogoAenderung =
  /** Nichts angefasst. */
  | { art: 'bleibt' }
  | { art: 'neu'; png: Blob; vorschau: string }
  | { art: 'weg' }

export function SpielFormular({ spiel, beschaeftigt, zurueck, logoAendern, spielSpeichern, loeschen }: {
  spiel: Spiel | null
  beschaeftigt: boolean
  zurueck: () => void
  /** Gibt zurück, ob es geklappt hat. */
  logoAendern: (gegner: string, png: Blob | null) => Promise<boolean>
  spielSpeichern: (daten: SpielDaten) => Promise<boolean>
  loeschen: () => Promise<void>
}) {
  const { daten } = useKasse()
  const [eingabe, setEingabe] = useState<SpielEingabe>(() => (spiel ? alsSpielEingabe(spiel) : LEERES_SPIEL))
  const [logo, setLogo] = useState<LogoAenderung>({ art: 'bleibt' })
  const [formFehler, setFormFehler] = useState<string | null>(null)
  const [bildLaedt, setBildLaedt] = useState(false)
  const [loeschFrage, setLoeschFrage] = useState(false)

  // Vorschau-Adresse freigeben, sobald sie nicht mehr gebraucht wird.
  useEffect(() => () => { if (logo.art === 'neu') URL.revokeObjectURL(logo.vorschau) }, [logo])

  const setze = <K extends keyof SpielEingabe>(k: K, v: SpielEingabe[K]) => setEingabe({ ...eingabe, [k]: v })

  // Kennt die Kasse den Gegner schon, zeigt sie sein Logo — auch beim Tippen.
  const vorhandenesLogo = eingabe.gegner.trim() ? logoFuer(daten.gegner, eingabe.gegner) : undefined
  const anzeigeLogo = logo.art === 'neu' ? logo.vorschau : logo.art === 'weg' ? undefined : vorhandenesLogo
  const bekannteGegner = [...new Set([...daten.gegner.map((g) => g.name), ...daten.spiele.map((s) => s.gegner)])].sort()
  const ergebnis = spiel && spiel.tore !== undefined && spiel.gegentore !== undefined ? `${spiel.tore}:${spiel.gegentore}` : null

  async function bildGewaehlt(datei: File | undefined) {
    if (!datei) return
    setBildLaedt(true)
    setFormFehler(null)
    try {
      const png = await logoVorbereiten(datei)
      setLogo({ art: 'neu', png, vorschau: URL.createObjectURL(png) })
    } catch (e) {
      setFormFehler(e instanceof Error ? e.message : 'Das Bild ging nicht.')
    } finally {
      setBildLaedt(false)
    }
  }

  async function absenden() {
    let geprueft: SpielDaten
    try {
      geprueft = pruefeSpiel(eingabe)
      setFormFehler(null)
    } catch (e) {
      setFormFehler(e instanceof Error ? e.message : 'Eingabe prüfen.')
      return
    }
    // Erst das Logo (es gehört zum Gegner), dann das Spiel. Scheitert das
    // Spiel, ist das Logo schon erledigt — ein zweiter Versuch lädt es nicht
    // noch einmal hoch und legt das Spiel nicht doppelt an.
    if (logo.art !== 'bleibt') {
      const ok = await logoAendern(geprueft.gegner, logo.art === 'neu' ? logo.png : null)
      if (!ok) return
      setLogo({ art: 'bleibt' })
    }
    if (await spielSpeichern(geprueft)) zurueck()
  }

  return (
    <>
      <Zurueck text="Spielplan" onClick={zurueck} />
      <section>
        <h2 className="sec-title" style={{ marginBottom: 3 }}>{spiel ? spiel.gegner : 'Neues Spiel'}</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          {spiel ? tagMitWochentag(spiel.datum) + (ergebnis ? ' · ' + ergebnis : '') : 'Erscheint für alle auf der Startseite.'}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div className="field">
          <label htmlFor="sp-gegner">Gegner</label>
          <input id="sp-gegner" className="input" type="text" list="sp-gegner-liste" autoComplete="off"
            autoCapitalize="words" placeholder="z. B. FV Engers II"
            value={eingabe.gegner} onChange={(e) => setze('gegner', e.target.value)} />
          <datalist id="sp-gegner-liste">
            {bekannteGegner.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>

        <div className="paar" style={{ gap: 11 }}>
          <div className="field" style={{ flex: 1.3, minWidth: 0 }}>
            <label htmlFor="sp-datum">Datum</label>
            <input id="sp-datum" className="input" type="date" style={{ minWidth: 0 }}
              value={eingabe.datum} onChange={(e) => setze('datum', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 0 }}>
            <label htmlFor="sp-anstoss">Anstoß</label>
            <input id="sp-anstoss" className="input" type="time" style={{ minWidth: 0 }}
              value={eingabe.anstoss} onChange={(e) => setze('anstoss', e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Spielort</label>
          <div className="seg" style={{ width: '100%' }}>
            <label className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
              <input type="radio" name="sp-ort" checked={eingabe.heim} onChange={() => setze('heim', true)} />
              <span>Heimspiel</span>
            </label>
            <label className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
              <input type="radio" name="sp-ort" checked={!eingabe.heim} onChange={() => setze('heim', false)} />
              <span>Auswärts</span>
            </label>
          </div>
        </div>

        <Karte style={{ padding: '12px 14px' }}>
          <div className="kicker" style={{ marginBottom: 9 }}>Logo des Gegners</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 64, height: 64, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-divider)', background: '#fff' }}>
              {anzeigeLogo
                ? <img src={anzeigeLogo} alt="" style={{ width: 58, height: 58, objectFit: 'contain' }} />
                : <span className="cond" style={{ fontSize: 20, color: 'var(--color-neutral-600)' }}>{kuerzel(eingabe.gegner || '?')}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
              <label className="btn btn-secondary" style={{ cursor: bildLaedt ? 'wait' : 'pointer' }}>
                {bildLaedt ? 'Bild wird vorbereitet …' : anzeigeLogo ? 'Anderes Logo wählen' : 'Logo wählen'}
                <input type="file" accept="image/*" hidden disabled={bildLaedt}
                  onChange={(e) => { void bildGewaehlt(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {logo.art === 'neu' && (
                <Tappable className="note" onClick={() => setLogo({ art: 'bleibt' })}>Doch nicht</Tappable>
              )}
              {logo.art === 'bleibt' && vorhandenesLogo && (
                <Tappable className="note" onClick={() => setLogo({ art: 'weg' })}>Logo entfernen</Tappable>
              )}
              {logo.art === 'weg' && (
                <Tappable className="note" onClick={() => setLogo({ art: 'bleibt' })}>Wird entfernt — rückgängig</Tappable>
              )}
            </div>
          </div>
          <div className="note" style={{ marginTop: 9, fontSize: 12 }}>
            {logo.art === 'neu'
              ? 'Wird beim Speichern hochgeladen und gilt für alle Spiele gegen ' + (eingabe.gegner.trim() || 'diesen Gegner') + '.'
              : 'Foto, Screenshot oder Datei von der Vereinsseite — wird automatisch verkleinert.'}
          </div>
        </Karte>
      </div>

      {formFehler && <div className="formfehler" role="alert">{formFehler}</div>}

      <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15, marginTop: 0 }}
        disabled={beschaeftigt || bildLaedt} onClick={() => void absenden()}>
        {beschaeftigt ? 'Speichert …' : spiel ? 'Speichern' : 'Spiel eintragen'}
      </button>

      {spiel && ergebnis && (
        <div className="note" style={{ fontSize: 12 }}>
          Das Ergebnis {ergebnis} kommt aus der Spieltag-Abrechnung und bleibt beim Speichern, wie es ist.
        </div>
      )}

      {spiel && (loeschFrage ? (
        <Karte style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 9 }}>
            Spiel löschen? Bereits abgerechnete Strafen bleiben in der Kasse stehen.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={beschaeftigt}
              onClick={() => void loeschen()}>
              Ja, löschen
            </button>
            <button className="btn btn-secondary" onClick={() => setLoeschFrage(false)}>Abbrechen</button>
          </div>
        </Karte>
      ) : (
        <button className="btn btn-secondary btn-block" style={{ padding: 12, marginTop: 0 }} onClick={() => setLoeschFrage(true)}>
          Spiel löschen
        </button>
      ))}
    </>
  )
}
