import wappen from '../assets/tsg-wappen.png'
import {
  bezeichnung, geburtstage, letztesSpiel, naechstesSpiel, namen,
  standProSpieler, summeOffen, wert,
} from '../model/berechnung'
import { fmtEur, fmtKiste, fmtKistenZahl, kuerzel, tagKurz, tagMitWochentag, vorname } from '../model/format'
import type { Spiel, Strafe } from '../model/types'
import { Karte, Kuerzel, Leer, Sektion, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

/** Sprüche für die Schandmauer — Platz eins zuerst. */
const SPOTT = [
  'hält die Kasse quasi im Alleingang',
  'kommt pünktlich. Zum Duschen.',
  'hat die Preisliste auswendig',
  'zahlt lieber als zu laufen',
  'Stammgast auf dieser Liste',
]

export function HomeScreen({ aufProfil }: { aufProfil: () => void }) {
  const kasse = useKasse()
  const { spieler, strafen, spiele } = kasse.daten

  const offenEur = summeOffen(strafen, 'eur')
  const offenKisten = summeOffen(strafen, 'kiste')
  const eurPosten = strafen.filter((s) => s.einheit === 'eur' && s.status === 'offen').length

  const meinEur = summeOffen(strafen, 'eur', kasse.betrifftMich)
  const meineKisten = summeOffen(strafen, 'kiste', kasse.betrifftMich)

  const stand = standProSpieler(strafen)
  const mauer = Object.keys(stand)
    .map((id) => ({ spieler: kasse.spielerVonId(id), ...stand[id] }))
    .filter((e) => e.spieler && e.spieler.rolle !== 'Trainer')
    .sort((a, b) => (b.eur + b.kiste * 15) - (a.eur + a.kiste * 15))
    .slice(0, 3)

  const ticker = strafen
    .filter((s) => s.status !== 'abgelehnt')
    .slice()
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 6)

  const letztes = letztesSpiel(spiele)
  const naechstes = naechstesSpiel(spiele)
  const gebs = geburtstage(spieler, strafen)

  return (
    <div className="stapel">

      <div className="paar">
        <Karte style={{ flex: 1, minWidth: 0, padding: '12px 12px 11px' }}>
          <div className="kicker">Offen gesamt</div>
          <div className="cond zahl-gross" style={{ color: 'var(--color-accent-800)' }}>{fmtEur(offenEur)}</div>
          <div className="note">{eurPosten === 1 ? '1 Posten' : eurPosten + ' Posten'}</div>
        </Karte>
        <Karte style={{ flex: 1, minWidth: 0, padding: '12px 12px 11px' }}>
          <div className="kicker">Offen gesamt</div>
          <div className="cond zahl-gross" style={{ color: 'var(--color-accent-2-700)' }}>{fmtKistenZahl(offenKisten)}</div>
          <div className="note">Kisten · nie in € umgerechnet</div>
        </Karte>
      </div>

      {kasse.ich && (
        <Tappable
          className="hover-accent-100"
          onClick={aufProfil}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--color-accent)' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kicker">Dein Stand, {vorname(kasse.ich.name)}</div>
            <div className="cond" style={{ fontSize: 22, lineHeight: 1.15, marginTop: 1 }}>
              {fmtEur(meinEur)}&nbsp;&nbsp;·&nbsp;&nbsp;{fmtKiste(meineKisten)}
            </div>
          </div>
          <span className="cond aktion">Zahlen</span>
        </Tappable>
      )}

      <div className="paar">
        <SpielKarte titel="Letztes Spiel" spiel={letztes} />
        <SpielKarte titel="Nächstes Spiel" spiel={naechstes} />
      </div>

      <Sektion titel="Schandmauer" hinweis="wer diese Saison am meisten liefert">
        {mauer.length === 0
          ? <Leer dicht>Noch nichts eingetragen. Genießt es, solange es hält.</Leer>
          : mauer.map((e, i) => (
            <div key={e.spieler!.id} className="rule-b zeile" style={{ gap: 12, padding: '10px 0' }}>
              <span className="cond" style={{ fontSize: 22, width: 22, color: 'var(--color-neutral-400)' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="zeile-name">{e.spieler!.name}</div>
                <div className="note">{SPOTT[i % SPOTT.length]}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="cond" style={{ fontSize: 19, lineHeight: 1.1, color: 'var(--color-accent-800)' }}>{fmtEur(e.eur)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-accent-2-800)' }}>{e.kiste ? fmtKiste(e.kiste) : 'keine Kiste'}</div>
              </div>
            </div>
          ))}
      </Sektion>

      <Sektion titel="Frisch reingekommen">
        {ticker.length === 0
          ? <Leer dicht>Hier ist noch nichts passiert.</Leer>
          : ticker.map((s) => <TickerZeile key={s.id} strafe={s} />)}
      </Sektion>

      <Karte style={{ padding: '12px 14px' }}>
        <div className="kicker">Nächster Geburtstag</div>
        {gebs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 4 }}>
            Noch keine Geburtstage hinterlegt.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
              <div className="cond" style={{ fontSize: 21, lineHeight: 1.1 }}>{gebs[0].spieler.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{gebs[0].datum}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 3 }}>
              Wird automatisch als 1 Kiste eingetragen. Ausreden zwecklos.
            </div>
          </>
        )}
      </Karte>

    </div>
  )
}

function SpielKarte({ titel, spiel }: { titel: string; spiel: Spiel | null }) {
  const kasse = useKasse()
  const gespielt = spiel?.tore !== undefined && spiel?.gegentore !== undefined

  return (
    <Karte style={{ flex: 1, minWidth: 0, padding: '11px 12px' }}>
      <div className="kicker">{titel}</div>
      {!spiel ? (
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginTop: 6 }}>
          Noch kein Spiel hinterlegt.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
            {gespielt ? (
              <>
                <img src={wappen} alt={kasse.daten.verein.name} style={{ width: 26, height: 26, flex: 'none', objectFit: 'contain' }} />
                <div className="cond" style={{ fontSize: 24, lineHeight: 1 }}>{spiel.tore} : {spiel.gegentore}</div>
                <Kuerzel text={kuerzel(spiel.gegner)} groesse={26} />
              </>
            ) : (
              <>
                <Kuerzel text={kuerzel(spiel.gegner)} groesse={26} />
                <div className="cond" style={{ fontSize: 24, lineHeight: 1 }}>
                  {spiel.anstoss ? tagMitWochentag(spiel.datum).slice(0, 2) + ' ' + spiel.anstoss : tagKurz(spiel.datum)}
                </div>
              </>
            )}
          </div>
          <div className="note" style={{ marginTop: 3 }}>
            {(spiel.heim ? 'gg. ' : 'bei ') + spiel.gegner}
          </div>
        </>
      )}
    </Karte>
  )
}

function TickerZeile({ strafe }: { strafe: Strafe }) {
  const kasse = useKasse()
  const farbe = strafe.einheit === 'eur' ? 'var(--color-accent-800)' : 'var(--color-accent-2-700)'

  return (
    <div className="rule-b" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.3 }}>
          <strong style={{ fontWeight: 600 }}>{namen(kasse.daten.spieler, strafe.spielerIds)}</strong>
          {' · '}{bezeichnung(strafe)}
        </div>
        <div className="note" style={{ marginTop: 1 }}>
          {tagKurz(strafe.datum)}
          {strafe.status === 'antrag' ? ' · wartet auf Bestätigung' : strafe.status === 'bezahlt' ? ' · bezahlt' : ' · offen'}
        </div>
      </div>
      <div className="cond" style={{ fontSize: 17, whiteSpace: 'nowrap', color: farbe }}>{wert(strafe)}</div>
    </div>
  )
}
