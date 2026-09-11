import { useState } from 'react'
import wappen from '../assets/tsg-wappen.png'
import { naechstesSpiel } from '../model/berechnung'
import { fmtEur, heuteIso } from '../model/format'
import { GegnerLogo } from '../components/GegnerLogo'
import { Karte, Leer, Sektion, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

/**
 * Der Trainer trägt Ergebnis und Kader ein — die Kasse verteilt die
 * Gegentore auf den Kader und die eigenen Tore auf den Trainer.
 */
export function SpieltagScreen() {
  const kasse = useKasse()
  const { spieler, spiele, verein } = kasse.daten

  const anstehend = naechstesSpiel(spiele)
  const kaderfaehig = spieler.filter((p) => p.rolle !== 'Trainer' && p.aktiv !== false)

  const [gegner, setGegner] = useState(anstehend?.gegner ?? '')
  const [datum, setDatum] = useState(anstehend?.datum ?? heuteIso())
  const [tore, setTore] = useState(0)
  const [gegentore, setGegentore] = useState(0)
  const [kaderIds, setKaderIds] = useState<string[]>(() => kaderfaehig.map((p) => p.id))

  const kaderN = kaderIds.length
  const summeKader = gegentore * 0.5 * kaderN

  return (
    <div className="stapel" style={{ gap: 18 }}>

      <section>
        <h2 className="sec-title" style={{ marginBottom: 3 }}>Spieltag abrechnen</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          Kader setzen, Ergebnis eintragen — den Rest rechnet die Kasse.
        </div>
      </section>

      <div className="paar">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="sg-gegner">Gegner</label>
          <input
            id="sg-gegner" className="input" type="text" placeholder="z. B. FV Engers II"
            value={gegner} onChange={(e) => setGegner(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="sg-datum">Datum</label>
          <input
            id="sg-datum" className="input" type="date" style={{ minWidth: 0 }}
            value={datum} onChange={(e) => setDatum(e.target.value)}
          />
        </div>
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
            name={gegner || 'Gegner'}
            zahl={gegentore}
            aufAb={(d) => setGegentore((n) => Math.max(0, n + d))}
            was="Gegentor"
          />
        </div>
      </Karte>

      <Sektion titel="Spieltagskader" hinweis={kaderfaehig.length ? `${kaderN} von ${kaderfaehig.length} markiert` : undefined}>
        {kaderfaehig.length === 0 ? (
          <Leer>Noch kein Kader hinterlegt.</Leer>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {kaderfaehig.map((p) => {
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
        <button
          className="btn btn-primary btn-block"
          style={{ padding: 13, fontSize: 15, marginTop: 12 }}
          onClick={() => kasse.spieltagAbrechnen({ gegner, datum, tore, gegentore, kaderIds })}
        >
          Spieltag abrechnen
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 8 }}>
          Vom Trainer abgerechnet — gilt sofort, ohne Antrag. Kisten bleiben davon unberührt.
        </div>
      </Karte>

    </div>
  )
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
