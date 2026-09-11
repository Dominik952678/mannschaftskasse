import { bezeichnung, summeOffen, wert } from '../model/berechnung'
import { fmtEur, fmtKiste, initialen, tagKurz } from '../model/format'
import type { Strafe } from '../model/types'
import { Karte, Leer, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

export function ProfilScreen({ aufZahlen }: { aufZahlen: () => void }) {
  const kasse = useKasse()
  const { strafen } = kasse.daten
  const ich = kasse.ich

  if (!ich) {
    return (
      <div className="stapel">
        <Leer>
          Noch kein Spieler zugeordnet. Sobald dein Profil hinterlegt ist,
          steht hier dein Stand — und der Knopf zum Bezahlen.
        </Leer>
      </div>
    )
  }

  const meinEur = summeOffen(strafen, 'eur', kasse.betrifftMich)
  const meineKisten = summeOffen(strafen, 'kiste', kasse.betrifftMich)
  const offen = strafen.filter((s) => kasse.betrifftMich(s) && s.status === 'offen')
  const bezahlt = strafen.filter((s) => kasse.betrifftMich(s) && s.status === 'bezahlt')

  const untertitel = [
    ich.position,
    ich.nummer !== undefined ? 'Nr. ' + ich.nummer : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="stapel" style={{ gap: 18 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div className="cond" style={{ width: 56, height: 56, flex: 'none', border: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--color-accent-800)' }}>
          {initialen(ich.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cond" style={{ fontSize: 24, lineHeight: 1.1, textTransform: 'uppercase' }}>{ich.name}</div>
          {untertitel && <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{untertitel}</div>}
        </div>
      </div>

      <div className="paar">
        <Karte style={{ flex: 1, minWidth: 0, padding: 12 }}>
          <div className="kicker">Offen</div>
          <div className="cond" style={{ fontSize: 34, lineHeight: 1.05, color: 'var(--color-accent-800)' }}>{fmtEur(meinEur)}</div>
        </Karte>
        <Karte style={{ flex: 1, minWidth: 0, padding: 12 }}>
          <div className="kicker">Offen</div>
          <div className="cond" style={{ fontSize: 34, lineHeight: 1.05, color: 'var(--color-accent-2-700)' }}>{fmtKiste(meineKisten)}</div>
        </Karte>
      </div>

      <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15 }} onClick={aufZahlen} disabled={meinEur === 0}>
        Bezahlen
      </button>

      <section>
        <h2 className="sec-title" style={{ marginBottom: 8 }}>Noch offen</h2>
        {offen.length === 0
          ? <Leer dicht>Blütenweiß. Genieß es.</Leer>
          : offen.map((s) => <MeineZeile key={s.id} strafe={s} />)}
      </section>

      <section>
        <h2 className="sec-title" style={{ marginBottom: 8 }}>Abgehakt</h2>
        {bezahlt.length === 0
          ? <Leer dicht>Noch nichts abgehakt.</Leer>
          : bezahlt.map((s) => <MeineZeile key={s.id} strafe={s} erledigt />)}
      </section>

      <Karte style={{ padding: '12px 14px' }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Regeln</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-800)' }}>
          Eine Strafe zählt, sobald der Kassenwart sie abnickt oder zwei Mitspieler sie bestätigen.
          Euro und Kisten laufen getrennt — eine Kiste kauft man sich nicht mit Geld frei.
        </div>
      </Karte>

      <Karte style={{ padding: '12px 14px' }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Angemeldet als {ich.rolle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-neutral-700)' }}>
            {ich.name} · dieses Gerät bleibt angemeldet, bis du dich abmeldest.
          </div>
          <button className="btn btn-secondary" style={{ flex: 'none' }} onClick={kasse.abmelden}>
            Abmelden
          </button>
        </div>
      </Karte>

    </div>
  )
}

function MeineZeile({ strafe, erledigt = false }: { strafe: Strafe; erledigt?: boolean }) {
  const farbe = strafe.einheit === 'eur' ? 'var(--color-accent-800)' : 'var(--color-accent-2-700)'
  return (
    <div
      className="rule-b"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: erledigt ? '9px 0' : '10px 0',
        color: erledigt ? 'var(--color-neutral-600)' : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.3, textDecoration: erledigt ? 'line-through' : undefined }}>
          {bezeichnung(strafe)}
        </div>
        <div style={{ fontSize: 11, color: erledigt ? undefined : 'var(--color-neutral-600)' }}>
          {tagKurz(strafe.datum)}{erledigt && ' · erledigt'}
        </div>
      </div>
      <div className="cond" style={{ fontSize: 17, color: erledigt ? undefined : farbe }}>{wert(strafe)}</div>
    </div>
  )
}

/** Wird von der Hülle über dem Tab-Wechsel eingeblendet. */
export function ZahlenSheet({ schliessen }: { schliessen: () => void }) {
  const kasse = useKasse()
  const meinEur = summeOffen(kasse.daten.strafen, 'eur', kasse.betrifftMich)
  const wer = kasse.kassenwart

  return (
    <div className="sheet-grund" onClick={schliessen}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Offene Beträge begleichen"
        className="sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cond" style={{ fontSize: 22, lineHeight: 1.1, textTransform: 'uppercase' }}>
          {fmtEur(meinEur)} begleichen
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 3, marginBottom: 14 }}>
          Kisten bringst du mit. Die kann man nicht überweisen.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <button
            className="btn btn-primary btn-block" style={{ padding: 13, margin: 0 }}
            onClick={() => { schliessen(); kasse.zahlungMelden('paypal') }}
          >
            Per PayPal an den Kassenwart
          </button>
          <button
            className="btn btn-secondary btn-block" style={{ padding: 13, margin: 0 }}
            onClick={() => { schliessen(); kasse.zahlungMelden('bar') }}
          >
            {wer ? 'Bar angekündigt — ' + wer.name.split(' ')[0] + ' hakt ab' : 'Bar angekündigt'}
          </button>
        </div>
        <Tappable onClick={schliessen} style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-neutral-600)', marginTop: 12 }}>
          Abbrechen
        </Tappable>
      </div>
    </div>
  )
}
