import { useEffect, useRef, useState } from 'react'
import wappen from '../assets/tsg-wappen.png'
import { useAuth } from '../auth/useAuth'
import type { Profil } from '../auth/typen'
import { ANFANGSDATEN } from '../data/anfang'
import { initialen } from '../model/format'
import { Karte, Leer, Tappable } from '../components/ui'

const CODE_LAENGE = 4

/**
 * Anmeldung in zwei Schritten: erst das eigene Profil aus dem Kader wählen,
 * dann den vierstelligen Code eingeben, der genau dieses Profil bestätigt.
 * Die Rolle des Profils entscheidet danach, was die App zeigt und zulässt.
 */
export function AnmeldeScreen() {
  const { profile, quelle } = useAuth()
  const [gewaehlt, setGewaehlt] = useState<Profil | null>(null)

  return (
    <div className="anmeldung">
      <header className="anmelde-kopf">
        <img src={wappen} alt="" width={64} height={64} style={{ objectFit: 'contain' }} />
        <div>
          <div className="cond anmelde-titel">Mannschaftskasse</div>
          <div className="kopf-unter">
            {ANFANGSDATEN.verein.mannschaft} · Saison {ANFANGSDATEN.verein.saison}
          </div>
        </div>
      </header>

      {gewaehlt
        ? <CodeEingabe profil={gewaehlt} zurueck={() => setGewaehlt(null)} />
        : <Profilwahl profile={profile} waehle={setGewaehlt} quelle={quelle} />}
    </div>
  )
}

function Profilwahl({ profile, waehle, quelle }: {
  profile: Profil[]
  waehle: (p: Profil) => void
  quelle: 'lokal' | 'supabase'
}) {
  return (
    <>
      <h1 className="sec-title" style={{ marginBottom: 10 }}>Wer bist du?</h1>

      {profile.length === 0 ? (
        <Leer>
          Noch kein Kader hinterlegt.
          {quelle === 'lokal'
            ? ' Trag die Mannschaft in src/data/anfang.ts ein.'
            : ' Leg die Spieler in Supabase an.'}
        </Leer>
      ) : (
        <div className="profil-liste">
          {profile.map((p) => (
            <Tappable
              key={p.id}
              className="profil-zeile hover-neutral-200"
              onClick={() => waehle(p)}
            >
              <div className="cond profil-kuerzel">{initialen(p.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="zeile-name">{p.name}</div>
                <div className="note">
                  {p.nummer !== undefined ? 'Nr. ' + p.nummer : 'ohne Nummer'}
                  {p.rolle !== 'Spieler' && ' · ' + p.rolle}
                </div>
              </div>
            </Tappable>
          ))}
        </div>
      )}
    </>
  )
}

function CodeEingabe({ profil, zurueck }: { profil: Profil; zurueck: () => void }) {
  const { anmelden } = useAuth()
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [uebrig, setUebrig] = useState<number | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [fokus, setFokus] = useState(true)
  const feld = useRef<HTMLInputElement>(null)

  useEffect(() => { feld.current?.focus() }, [])

  async function pruefen(eingabe: string) {
    setPrueft(true)
    setFehler(null)
    const ergebnis = await anmelden(profil.id, eingabe)
    if (!ergebnis.ok) {
      setFehler(ergebnis.text)
      setUebrig(ergebnis.versucheUebrig ?? null)
      setCode('')
      setPrueft(false)
      feld.current?.focus()
    }
    // Bei Erfolg tauscht der AuthProvider den Bildschirm aus.
  }

  function tippen(roh: string) {
    const ziffern = roh.replace(/\D/g, '').slice(0, CODE_LAENGE)
    setCode(ziffern)
    setFehler(null)
    if (ziffern.length === CODE_LAENGE) void pruefen(ziffern)
  }

  return (
    <>
      <Karte style={{ padding: '16px 16px 20px' }}>
        <div className="kicker">Anmelden als</div>
        <div className="cond" style={{ fontSize: 26, lineHeight: 1.1, textTransform: 'uppercase', marginTop: 2 }}>
          {profil.name}
        </div>
        <div className="note" style={{ marginTop: 2 }}>
          {profil.rolle === 'Spieler' ? 'Spieler' : profil.rolle} · vierstelliger Code
        </div>

        <div
          className="code-feld"
          onClick={() => feld.current?.focus()}
          style={{ marginTop: 18 }}
        >
          <input
            ref={feld}
            className="code-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={'Code für ' + profil.name}
            maxLength={CODE_LAENGE}
            value={code}
            disabled={prueft}
            onFocus={() => setFokus(true)}
            onBlur={() => setFokus(false)}
            onChange={(e) => tippen(e.target.value)}
          />
          {Array.from({ length: CODE_LAENGE }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className={'code-kaestchen' + (fokus && code.length === i && !prueft ? ' code-aktiv' : '')}
            >
              {code[i] ? '•' : ''}
            </div>
          ))}
        </div>

        <div className="code-status" role="status" aria-live="polite">
          {prueft && 'Wird geprüft …'}
          {!prueft && fehler && (
            <span style={{ color: 'var(--color-accent-800)' }}>
              {fehler}
              {uebrig !== null && uebrig > 0 && ' Noch ' + uebrig + (uebrig === 1 ? ' Versuch.' : ' Versuche.')}
            </span>
          )}
          {!prueft && !fehler && 'Den Code hat dir der Kassenwart gegeben.'}
        </div>
      </Karte>

      <button className="btn btn-secondary btn-block" style={{ padding: 13 }} onClick={zurueck} disabled={prueft}>
        Doch jemand anderes
      </button>

      <div className="note" style={{ textAlign: 'center', marginTop: 4 }}>
        Angemeldet bleibst du, bis du dich im Profil wieder abmeldest.
      </div>
    </>
  )
}
