import { useState } from 'react'
import { bezeichnung, namen, standProSpieler, wert } from '../model/berechnung'
import { fmtBetrag, fmtEur, tagKurz, vorname } from '../model/format'
import { KATALOG_BY, KATALOG_WAEHLBAR } from '../model/katalog'
import type { Katalogeintrag, Strafe } from '../model/types'
import { IconCheck, IconClose, Karte, Leer, Sektion, Tappable } from '../components/ui'
import { useKasse } from '../store/useKasse'

export function EintragenScreen() {
  const kasse = useKasse()
  const antraege = kasse.daten.strafen.filter((s) => s.status === 'antrag')

  return (
    <div className="stapel" style={{ gap: 18 }}>
      <Antragsformular />

      <hr className="hr" style={{ margin: '2px 0' }} />

      <Sektion
        titel="Anträge"
        hinweis={kasse.darf.direktBuchen ? 'du nickst allein ab' : 'zwei Stimmen oder der Kassenwart'}
      >
        {antraege.length === 0
          ? <Leer>Nichts offen. Entweder wart ihr brav oder es hat keiner gepetzt.</Leer>
          : antraege.map((s) => <AntragsKarte key={s.id} strafe={s} />)}
      </Sektion>
    </div>
  )
}

// ── Grund antippen, Leute markieren, fertig ───────────────────────────────

function Antragsformular() {
  const kasse = useKasse()
  const { spieler, strafen } = kasse.daten

  const [typId, setTypId] = useState<string | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const [betragText, setBetragText] = useState('')
  const [suche, setSuche] = useState('')

  const typ: Katalogeintrag | null = typId ? KATALOG_BY[typId] : null
  const stand = standProSpieler(strafen)

  const satz = typ
    ? (typ.satz === null ? (parseFloat(betragText.replace(',', '.')) || 0) : typ.satz)
    : 0
  const summe = typ ? fmtBetrag(gewaehlt.length * satz, typ.einheit) : '—'

  function typWaehlen(k: Katalogeintrag) {
    setTypId(k.id === typId ? null : k.id)
    setGewaehlt([])
    setBetragText(k.satz === null ? '' : '')
    setSuche('')
  }

  function umschalten(id: string) {
    setGewaehlt((liste) => liste.includes(id) ? liste.filter((x) => x !== id) : liste.concat([id]))
    setSuche('')
  }

  const q = suche.trim().toLowerCase()
  const treffer = spieler
    .filter((p) => p.aktiv !== false)
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => Number(gewaehlt.includes(b.id)) - Number(gewaehlt.includes(a.id)))
    .slice(0, q ? 40 : 8)

  const werHinweis = typ?.paar ? 'genau 2 — die in der Mitte' : 'mehrere möglich'
  const hinweis = !typ
    ? 'Wähle einen Grund. Der Rest geht von allein.'
    : typ.paar
      ? 'Eine Kiste, geteilt: ½ Kiste pro Kopf.'
      : typ.satz === null
        ? 'Betrag legt der Trainer fest.'
        : kasse.darf.direktBuchen
          ? 'Dein Eintrag gilt sofort — ohne Antrag.'
          : 'Geht als Antrag raus. Zwei Mitspieler oder der Kassenwart müssen nicken.'

  function absenden() {
    if (!typ) return kasse.melde('Erst den Grund antippen.')
    if (!gewaehlt.length) return kasse.melde('Und wer war’s?')
    if (typ.paar && gewaehlt.length !== 2) return kasse.melde('Genau zwei — die beiden in der Mitte.')
    if (!satz) return kasse.melde('Betrag fehlt.')
    kasse.strafenAnlegen(gewaehlt, typ.id, satz, typ.paar)
    setTypId(null)
    setGewaehlt([])
    setBetragText('')
  }

  return (
    <>
      <section>
        <h2 className="sec-title" style={{ marginBottom: 4 }}>Was war los?</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginBottom: 10 }}>
          Grund antippen, Leute markieren, fertig.
        </div>
        <div className="kacheln">
          {KATALOG_WAEHLBAR.map((k) => {
            const an = typId === k.id
            return (
              <Tappable
                key={k.id}
                gedrueckt={an}
                onClick={() => typWaehlen(k)}
                className={an ? 'kachel kachel-an' : 'kachel'}
              >
                <div className="cond" style={{ fontSize: 15, lineHeight: 1.1, textTransform: 'uppercase' }}>{k.label}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{k.preis}</div>
              </Tappable>
            )
          })}
        </div>
      </section>

      {typ && (
        <>
          <Sektion titel="Wer?" hinweis={werHinweis}>
            {gewaehlt.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
                {gewaehlt.map((id) => (
                  <Tappable
                    key={id}
                    label={(kasse.spielerVonId(id)?.name ?? '') + ' abwählen'}
                    onClick={() => umschalten(id)}
                    className="chip chip-an"
                  >
                    <span>{kasse.spielerVonId(id)?.name}</span>
                    <IconClose size={12} width={2} />
                  </Tappable>
                ))}
              </div>
            )}

            {spieler.length === 0 ? (
              <Leer>Noch kein Kader hinterlegt.</Leer>
            ) : (
              <>
                <input
                  className="input" type="text" placeholder="Namen tippen …"
                  aria-label="Spieler suchen"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                />
                <div style={{ border: '1px solid var(--color-divider)', borderTop: 0, maxHeight: 236, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                  {treffer.map((p) => {
                    const an = gewaehlt.includes(p.id)
                    const offen = stand[p.id]?.eur ?? 0
                    return (
                      <Tappable
                        key={p.id}
                        gedrueckt={an}
                        className="hover-neutral-200"
                        onClick={() => umschalten(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '11px',
                          borderBottom: '1px solid var(--color-divider)',
                          background: an ? 'var(--color-accent-100)' : 'transparent',
                        }}
                      >
                        <div style={{
                          width: 19, height: 19, flex: 'none',
                          border: '1px solid ' + (an ? 'var(--color-accent)' : 'var(--color-neutral-400)'),
                          background: an ? 'var(--color-accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                        }}>
                          <IconCheck size={12} width={2.4} opacity={an ? 1 : 0} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        <div className="note" style={{ whiteSpace: 'nowrap' }}>
                          {offen ? fmtEur(offen) + ' offen' : 'blitzsauber'}
                        </div>
                      </Tappable>
                    )
                  })}
                  {treffer.length === 0 && (
                    <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-neutral-600)' }}>
                      Kennt hier keiner.
                    </div>
                  )}
                </div>
              </>
            )}
          </Sektion>

          {typ.satz === null && (
            <div className="field">
              <label htmlFor="betrag">Betrag — der Trainer entscheidet</label>
              <input
                id="betrag" className="input" type="text" inputMode="decimal" placeholder="z. B. 7,50"
                value={betragText}
                onChange={(e) => setBetragText(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      <Karte style={{ padding: '13px 14px', background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kicker">Summe des Antrags</div>
            <div className="cond" style={{ fontSize: 26, lineHeight: 1.1 }}>{summe}</div>
          </div>
          <button className="btn btn-primary" style={{ padding: '11px 16px', fontSize: 15 }} onClick={absenden}>
            Antrag stellen
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 7 }}>{hinweis}</div>
      </Karte>
    </>
  )
}

// ── Anträge abarbeiten ────────────────────────────────────────────────────

function AntragsKarte({ strafe }: { strafe: Strafe }) {
  const kasse = useKasse()
  const farbe = strafe.einheit === 'eur' ? 'var(--color-accent-800)' : 'var(--color-accent-2-700)'
  const von = strafe.angelegtVon ? kasse.spielerVonId(strafe.angelegtVon) : null

  return (
    <Karte style={{ padding: '11px 12px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, lineHeight: 1.3 }}>
            <strong style={{ fontWeight: 600 }}>{namen(kasse.daten.spieler, strafe.spielerIds)}</strong>
            {' · '}{bezeichnung(strafe)}
          </div>
          <div className="note" style={{ marginTop: 2 }}>
            {tagKurz(strafe.datum)}
            {von && ' · von ' + vorname(von.name)}
            {kasse.darf.direktBuchen ? ' · du kannst allein entscheiden' : ' · ' + strafe.bestaetigtVon.length + '/2 bestätigt'}
          </div>
        </div>
        <div className="cond" style={{ fontSize: 18, whiteSpace: 'nowrap', color: farbe }}>{wert(strafe)}</div>
        <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
          {kasse.darf.ablehnen && (
            <Tappable
              className="hover-neutral-200 icon-knopf"
              label="Ablehnen"
              onClick={() => kasse.entscheiden(strafe.id, false)}
              style={{ border: '1px solid var(--color-divider)', color: 'var(--color-neutral-700)' }}
            >
              <IconClose />
            </Tappable>
          )}
          <Tappable
            className="hover-accent-600 icon-knopf"
            label="Bestätigen"
            onClick={() => kasse.entscheiden(strafe.id, true)}
            style={{ border: '1px solid var(--color-accent)', background: 'var(--color-accent)', color: '#fff' }}
          >
            <IconCheck />
          </Tappable>
        </div>
      </div>
    </Karte>
  )
}
