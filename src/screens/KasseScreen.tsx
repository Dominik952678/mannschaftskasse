import { useState } from 'react'
import { geburtstage, offenProSpieler, summeOffen } from '../model/berechnung'
import type { Posten } from '../model/berechnung'
import { fmtBetrag, fmtEur, fmtKiste, initialen } from '../model/format'
import type { Einheit } from '../model/types'
import { IconCheck, IconMuell, Karte, Leer, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

export function KasseScreen() {
  const kasse = useKasse()
  const { spieler, strafen } = kasse.daten

  const [ansicht, setAnsicht] = useState<Einheit>('eur')
  const [offenAuf, setOffenAuf] = useState<string | null>(null)

  const wechsle = (e: Einheit) => { setAnsicht(e); setOffenAuf(null) }

  const gesamt = summeOffen(strafen, ansicht)
  const staende = offenProSpieler(strafen, ansicht)
  const ids = Object.keys(staende).sort((a, b) => staende[b].summe - staende[a].summe)
  const farbe = ansicht === 'eur' ? 'var(--color-accent-800)' : 'var(--color-accent-2-700)'

  return (
    <div className="stapel" style={{ gap: 16 }}>

      <div className="seg" style={{ width: '100%' }}>
        <label className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
          <input type="radio" name="kasseansicht" value="eur" checked={ansicht === 'eur'} onChange={() => wechsle('eur')} />
          <span>Euro</span>
        </label>
        <label className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
          <input type="radio" name="kasseansicht" value="kiste" checked={ansicht === 'kiste'} onChange={() => wechsle('kiste')} />
          <span>Kisten</span>
        </label>
      </div>

      <Karte className="auf-accent" style={{ padding: '14px 16px' }}>
        <div className="kicker-on-accent">{ansicht === 'eur' ? 'Offen in Euro' : 'Offen in Kisten'}</div>
        <div className="cond" style={{ fontSize: 46, lineHeight: 1, marginTop: 2 }}>
          {ansicht === 'eur' ? fmtEur(gesamt) : fmtKiste(gesamt)}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: 'rgba(255,255,255,0.8)' }}>
          {ansicht === 'eur'
            ? 'Kisten laufen getrennt und werden nie umgerechnet.'
            : 'Werden mitgebracht, nicht überwiesen.'}
        </div>
      </Karte>

      <div>
        {ids.length === 0 && (
          <Leer>
            {spieler.length === 0
              ? 'Noch kein Kader hinterlegt.'
              : ansicht === 'eur' ? 'Kein Cent offen. Das hält nie.' : 'Keine Kiste offen. Auch das hält nie.'}
          </Leer>
        )}

        {ids.map((id) => {
          const p = kasse.spielerVonId(id)
          if (!p) return null
          const s = staende[id]
          const auf = offenAuf === id
          const ichSelbst = id === kasse.ich?.id

          return (
            <div key={id} className="rule-b">
              <Tappable
                onClick={() => setOffenAuf(auf ? null : id)}
                gedrueckt={auf}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0' }}
              >
                <div
                  className="cond"
                  style={{
                    width: 34, height: 34, flex: 'none', border: '1px solid var(--color-divider)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: 'var(--color-neutral-700)',
                    background: ichSelbst ? 'var(--color-accent-100)' : 'transparent',
                  }}
                >
                  {initialen(p.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="zeile-name">{p.name}{ichSelbst && ' (du)'}</div>
                  <div className="note">{s.posten.length === 1 ? '1 Posten' : s.posten.length + ' Posten'}</div>
                </div>
                <div className="cond" style={{ fontSize: 20, whiteSpace: 'nowrap', color: farbe }}>
                  {fmtBetrag(s.summe, ansicht)}
                </div>
              </Tappable>

              {auf && (
                <div style={{ padding: '2px 0 12px 45px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {s.posten.map((posten) => <PostenZeile key={posten.id} posten={posten} />)}
                  {kasse.darf.abhaken && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { kasse.abhaken(id, ansicht); setOffenAuf(null) }}>
                        Alles abhaken
                      </button>
                      <button className="btn btn-secondary" style={{ flex: 'none' }} onClick={() => kasse.erinnern(id)}>
                        Erinnern
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {ansicht === 'kiste' && <Geburtstagsliste />}

    </div>
  )
}

function Geburtstagsliste() {
  const kasse = useKasse()
  const liste = geburtstage(kasse.daten.spieler, kasse.daten.strafen)

  return (
    <Karte style={{ padding: '13px 14px' }}>
      <div className="kicker" style={{ marginBottom: 7 }}>Geburtstage · je 1 Kiste</div>
      {liste.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>Noch keine Geburtstage hinterlegt.</div>
      ) : liste.map((g) => (
        <div key={g.spieler.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 14 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{g.spieler.name}</span>
          <span style={{ color: 'var(--color-neutral-600)', fontSize: 12 }}>{g.datum}</span>
          <span className={g.status === 'eingetragen' ? 'tag tag-neutral' : 'tag tag-accent-2'}>{g.status}</span>
        </div>
      ))}
    </Karte>
  )
}

// ── Ein Posten in der Kassenliste ─────────────────────────────────────────

/**
 * Zeigt den Posten und, für den Kassenwart, zwei Handgriffe: abhaken und
 * rausnehmen. Rausnehmen fragt vorher nach — die Zeile wird dafür kurz zur
 * Rückfrage, statt einen Dialog aufzumachen.
 */
function PostenZeile({ posten }: { posten: Posten }) {
  const kasse = useKasse()
  const [fragt, setFragt] = useState(false)

  if (fragt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 32 }}>
        <span style={{ flex: 1, minWidth: 0, color: 'var(--color-neutral-700)' }}>
          {posten.geteilt ? 'Für alle Beteiligten rausnehmen?' : 'Raus damit? Kommt nicht wieder.'}
        </span>
        <button className="btn btn-secondary" style={KNOPF} onClick={() => setFragt(false)}>
          Doch nicht
        </button>
        <button className="btn btn-primary" style={KNOPF} onClick={() => { setFragt(false); kasse.loeschen(posten.id) }}>
          Raus
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, minHeight: 32 }}>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--color-neutral-800)' }}>{posten.text}</span>
      <span style={{ color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>{posten.betrag}</span>

      {kasse.darf.abhaken && (
        <Tappable
          className="hover-accent-600"
          label={'„' + posten.text + '“ abhaken'}
          onClick={() => kasse.bezahlen(posten.id, true)}
          style={{ ...QUADRAT, border: '1px solid var(--color-accent)', color: 'var(--color-accent-800)' }}
        >
          <IconCheck size={13} width={2} />
        </Tappable>
      )}
      {kasse.darf.loeschen && (
        <Tappable
          className="hover-neutral-200"
          label={'„' + posten.text + '“ rausnehmen'}
          onClick={() => setFragt(true)}
          style={{ ...QUADRAT, border: '1px solid var(--color-divider)', color: 'var(--color-neutral-700)' }}
        >
          <IconMuell size={13} />
        </Tappable>
      )}
    </div>
  )
}

const QUADRAT = {
  width: 30, height: 30, flex: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
} as const

const KNOPF = { padding: '5px 10px', fontSize: 13, flex: 'none' } as const
