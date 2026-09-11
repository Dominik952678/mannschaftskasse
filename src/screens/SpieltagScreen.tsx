import { useState } from 'react'
import wappen from '../assets/tsg-wappen.png'
import { spieltagVorschlag } from '../model/berechnung'
import { fmtEur, tagMitWochentag } from '../model/format'
import type { Spiel } from '../model/types'
import { GegnerLogo } from '../components/GegnerLogo'
import { Karte, Leer, Sektion, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

/**
 * Der Trainer trägt Ergebnis und Kader ein — die Kasse verteilt die
 * Gegentore auf den Kader und die eigenen Tore auf den Trainer.
 *
 * Das Spiel kommt aus dem Spielplan. Ein schon abgerechnetes lässt sich
 * wieder aufrufen und ändern; die Kasse wird dann angeglichen.
 */
export function SpieltagScreen() {
  const { spiele } = useKasse().daten

  // Einmal vorgeschlagen, bleibt das Spiel gewählt — auch wenn es nach dem
  // Abrechnen nicht mehr der Vorschlag wäre.
  const [gewaehlt, setGewaehlt] = useState(() => spieltagVorschlag(spiele)?.id)
  const spiel = spiele.find((s) => s.id === gewaehlt) ?? spieltagVorschlag(spiele)

  if (!spiel) {
    return (
      <div className="stapel" style={{ gap: 18 }}>
        <Kopf abgerechnet={false} />
        <Leer>
          Noch kein Spiel im Spielplan. Den pflegt der Admin unter Profil → Verwaltung → Spielplan.
        </Leer>
      </div>
    )
  }

  // Ein anderes Spiel fängt mit seinen eigenen Werten frisch an.
  return <Abrechnung key={spiel.id} spiel={spiel} waehle={setGewaehlt} />
}

function Kopf({ abgerechnet }: { abgerechnet: boolean }) {
  return (
    <section>
      <h2 className="sec-title" style={{ marginBottom: 3 }}>
        {abgerechnet ? 'Spieltag ändern' : 'Spieltag abrechnen'}
      </h2>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
        {abgerechnet
          ? 'Schon abgerechnet. Was du hier änderst, gleicht die Kasse an.'
          : 'Kader setzen, Ergebnis eintragen — den Rest rechnet die Kasse.'}
      </div>
    </section>
  )
}

function Abrechnung({ spiel, waehle }: { spiel: Spiel; waehle: (id: string) => void }) {
  const kasse = useKasse()
  const { spieler, spiele, strafen, verein } = kasse.daten

  const abgerechnet = spiel.tore !== undefined
  const gespeichert = spiel.kader ?? []

  // Wer beim Spiel dabei war, bleibt wählbar — auch wenn er inzwischen
  // ausgetreten ist. Nur so lässt er sich wieder herausnehmen.
  const auswahl = spieler.filter((p) =>
    gespeichert.includes(p.id) || (p.rolle !== 'Trainer' && p.aktiv !== false))

  const [tore, setTore] = useState(spiel.tore ?? 0)
  const [gegentore, setGegentore] = useState(spiel.gegentore ?? 0)
  const [kaderIds, setKaderIds] = useState<string[]>(() =>
    abgerechnet ? gespeichert : auswahl.map((p) => p.id))

  const kaderN = kaderIds.length
  const summeKader = gegentore * 0.5 * kaderN

  const dazu = kaderIds.filter((id) => !gespeichert.includes(id))
  const raus = gespeichert.filter((id) => !kaderIds.includes(id))
  const ergebnisAnders = tore !== spiel.tore || gegentore !== spiel.gegentore
  const geaendert = !abgerechnet || ergebnisAnders || dazu.length > 0 || raus.length > 0

  // Bezahlte Posten bleiben bezahlt, auch wenn sich ihr Betrag ändert oder
  // sie wegfallen — das Geld muss dann der Kassenwart geraderücken.
  const bezahltBetroffen = abgerechnet
    ? strafen.filter((s) => s.spielId === spiel.id && s.status === 'bezahlt' && (
      s.typId === 'gegentor'
        ? gegentore !== spiel.gegentore || s.spielerIds.some((id) => !kaderIds.includes(id))
        : s.typId === 'tor' && tore !== spiel.tore))
    : []

  const name = (id: string) => kasse.spielerVonId(id)?.name ?? '?'
  const liste = (ids: string[]) => [...new Set(ids)].map(name).join(', ')

  const offen = spiele
    .filter((s) => s.tore === undefined)
    .sort((a, b) => a.datum.localeCompare(b.datum))
  const erledigt = spiele
    .filter((s) => s.tore !== undefined)
    .sort((a, b) => b.datum.localeCompare(a.datum))

  return (
    <div className="stapel" style={{ gap: 18 }}>

      <Kopf abgerechnet={abgerechnet} />

      <div className="field">
        <label htmlFor="sg-spiel">Spiel</label>
        <select id="sg-spiel" className="input" value={spiel.id} onChange={(e) => waehle(e.target.value)}>
          {offen.length > 0 && (
            <optgroup label="Noch nicht abgerechnet">
              {offen.map((s) => <option key={s.id} value={s.id}>{spielText(s)}</option>)}
            </optgroup>
          )}
          {erledigt.length > 0 && (
            <optgroup label="Abgerechnet — zum Ändern">
              {erledigt.map((s) => <option key={s.id} value={s.id}>{spielText(s)}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <Karte className="auf-accent" style={{ padding: '14px 16px' }}>
        <div className="kicker-on-accent">Ergebnis</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Seite
            name={verein.name}
            bild={wappen}
            zahl={tore}
            aufAb={(d) => setTore((n) => Math.max(0, n + d))}
            was="Tor"
          />
          <Seite
            name={spiel.gegner}
            zahl={gegentore}
            aufAb={(d) => setGegentore((n) => Math.max(0, n + d))}
            was="Gegentor"
          />
        </div>
      </Karte>

      <Sektion titel="Spieltagskader" hinweis={auswahl.length ? `${kaderN} von ${auswahl.length} markiert` : undefined}>
        {abgerechnet && gespeichert.length === 0 && (
          <div className="note" style={{ marginBottom: 8 }}>
            Zu diesem Spiel ist kein Kader gespeichert. Markier, wer dabei war.
          </div>
        )}
        {auswahl.length === 0 ? (
          <Leer>Noch kein Kader hinterlegt.</Leer>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {auswahl.map((p) => {
              const an = kaderIds.includes(p.id)
              return (
                <Tappable
                  key={p.id}
                  gedrueckt={an}
                  className={an ? 'chip chip-an' : 'chip'}
                  onClick={() => setKaderIds((liste) =>
                    liste.includes(p.id) ? liste.filter((x) => x !== p.id) : liste.concat([p.id]))}
                >
                  {p.name}
                </Tappable>
              )
            })}
          </div>
        )}
      </Sektion>

      <Karte style={{ padding: '13px 14px', background: 'var(--color-surface)' }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Das kostet der Nachmittag</div>
        <Rechenzeile
          text={`${gegentore} ${gegentore === 1 ? 'Gegentor' : 'Gegentore'} × ${kaderN} Mann × 0,50 €`}
          betrag={fmtEur(summeKader)}
          linie
        />
        <Rechenzeile
          text={`${tore} ${tore === 1 ? 'Tor' : 'Tore'} × 1 € — zahlt der Trainer`}
          betrag={fmtEur(tore)}
        />

        {abgerechnet && (dazu.length > 0 || raus.length > 0) && (
          <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>
            {dazu.length > 0 && <div>Neu im Kader: {liste(dazu)}</div>}
            {raus.length > 0 && <div>Raus: {liste(raus)} — deren Posten fallen weg.</div>}
          </div>
        )}
        {bezahltBetroffen.length > 0 && (
          <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, color: 'var(--color-accent-800)' }}>
            Schon bezahlt: {liste(bezahltBetroffen.flatMap((s) => s.spielerIds))}. Der Posten ändert sich
            trotzdem und bleibt als bezahlt stehen — die Differenz klärt der Kassenwart.
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          style={{ padding: 13, fontSize: 15, marginTop: 12 }}
          disabled={kasse.speichert || !geaendert}
          onClick={() => kasse.spieltagAbrechnen({ spielId: spiel.id, tore, gegentore, kaderIds })}
        >
          {abgerechnet ? (geaendert ? 'Änderungen speichern' : 'Nichts geändert') : 'Spieltag abrechnen'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 8 }}>
          Vom Trainer abgerechnet — gilt sofort, ohne Antrag. Kisten bleiben davon unberührt.
        </div>
      </Karte>

    </div>
  )
}

/** "So 14.09. · gg. FV Engers II", mit Ergebnis dahinter, wenn es eins gibt. */
function spielText(s: Spiel) {
  const text = tagMitWochentag(s.datum) + ' · ' + (s.heim ? 'gg. ' : 'bei ') + s.gegner
  return s.tore !== undefined ? `${text} · ${s.tore}:${s.gegentore ?? 0}` : text
}

function Seite({ name, bild, zahl, aufAb, was }: {
  name: string
  bild?: string
  zahl: number
  aufAb: (d: number) => void
  was: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {bild
          ? <img src={bild} alt="" style={{ width: 24, height: 24, flex: 'none', objectFit: 'contain', background: '#fff', padding: 1 }} />
          : <GegnerLogo name={name} groesse={24} aufAccent />}
        <div className="cond" style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <Tappable className="stepper" label={`Ein ${was} weniger`} onClick={() => aufAb(-1)}>−</Tappable>
        <div className="cond" style={{ fontSize: 40, lineHeight: 1, minWidth: 34, textAlign: 'center', color: 'var(--color-accent-2)' }}>{zahl}</div>
        <Tappable className="stepper" label={`Ein ${was} mehr`} onClick={() => aufAb(1)}>+</Tappable>
      </div>
    </div>
  )
}

function Rechenzeile({ text, betrag, linie = false }: { text: string; betrag: string; linie?: boolean }) {
  return (
    <div className={linie ? 'rule-b' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{text}</span>
      <span className="cond" style={{ fontSize: 18, color: 'var(--color-accent-800)', whiteSpace: 'nowrap' }}>{betrag}</span>
    </div>
  )
}
