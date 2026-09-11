import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { erzeugeVerwaltung } from '../data/verwaltungFabrik'
import { initialen, vorname } from '../model/format'
import { alsEingabe, LEERE_EINGABE, pruefeEingabe, ROLLEN } from '../model/spielerEingabe'
import type { SpielerEingabe } from '../model/spielerEingabe'
import type { KaderEintrag } from '../model/types'
import { Karte, Leer, Sektion, Tappable, Zurueck } from '../components/ui'
import { SpielFormular, SpielplanListe } from './SpielplanVerwaltung'
import { useKasse } from '../store/useKasse'
import { fehlertext } from '../model/fehler'

type Bereich = 'kader' | 'spielplan'

type Ansicht =
  | { art: 'liste'; bereich: Bereich }
  | { art: 'neu' }
  /** `frisch`: gerade angelegt — der Code soll gleich raus. */
  | { art: 'spieler'; id: string; frisch?: boolean }
  /** `id` null: neues Spiel. */
  | { art: 'spiel'; id: string | null }

const ZUM_KADER: Ansicht = { art: 'liste', bereich: 'kader' }
const ZUM_SPIELPLAN: Ansicht = { art: 'liste', bereich: 'spielplan' }

/**
 * Die Verwaltung — nur für Admins erreichbar, über das Profil.
 * Kader: Spieler anlegen und ändern, Rollen setzen, Codes zeigen,
 * weiterleiten und neu würfeln, Sperren aufheben, Geräte abmelden.
 * Spielplan: Spiele anlegen, ändern, löschen; Logos der Gegner hochladen.
 */
export function VerwaltungScreen({ zurueck }: { zurueck: () => void }) {
  const kasse = useKasse()
  const { sitzung } = useAuth()
  const repo = useMemo(() => (sitzung ? erzeugeVerwaltung(sitzung) : null), [sitzung])

  const [kader, setKader] = useState<KaderEintrag[] | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<Ansicht>(ZUM_KADER)
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const oben = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!repo) return
    let abgebrochen = false
    repo.kader()
      .then((k) => { if (!abgebrochen) setKader(k) })
      .catch((e: unknown) => { if (!abgebrochen) setLadefehler(fehlertext(e, 'Laden ging nicht.')) })
    return () => { abgebrochen = true }
  }, [repo])

  // Beim Wechsel der Ansicht wieder oben anfangen.
  useEffect(() => { oben.current?.scrollIntoView({ block: 'start' }) }, [ansicht])

  /** Ausführen, Verwaltung und Kasse neu laden, Bescheid sagen. */
  async function ausfuehren<T>(aktion: () => Promise<T>, erfolg?: (t: T) => string): Promise<T | undefined> {
    if (!repo) return undefined
    setBeschaeftigt(true)
    try {
      const ergebnis = await aktion()
      setKader(await repo.kader())
      await kasse.aktualisieren()
      if (erfolg) kasse.melde(erfolg(ergebnis))
      return ergebnis
    } catch (e) {
      kasse.melde(fehlertext(e, 'Das hat nicht geklappt.'))
      return undefined
    } finally {
      setBeschaeftigt(false)
    }
  }

  if (!repo) return null

  const aktuell = ansicht.art === 'spieler' ? kader?.find((k) => k.spieler.id === ansicht.id) : undefined
  const spielId = ansicht.art === 'spiel' ? ansicht.id : null
  const spiel = spielId ? kasse.daten.spiele.find((s) => s.id === spielId) ?? null : null

  return (
    <div className="stapel" style={{ gap: 18 }} ref={oben}>
      {ansicht.art === 'liste' && (
        <Liste
          bereich={ansicht.bereich}
          setBereich={(bereich) => setAnsicht({ art: 'liste', bereich })}
          kader={kader}
          ladefehler={ladefehler}
          ichId={sitzung?.spielerId}
          zurueck={zurueck}
          neu={() => setAnsicht({ art: 'neu' })}
          oeffnen={(id) => setAnsicht({ art: 'spieler', id })}
          neuesSpiel={() => setAnsicht({ art: 'spiel', id: null })}
          spielOeffnen={(id) => setAnsicht({ art: 'spiel', id })}
        />
      )}

      {ansicht.art === 'spiel' && (spielId === null || spiel) && (
        <SpielFormular
          key={spielId ?? 'neu'}
          spiel={spiel}
          beschaeftigt={beschaeftigt}
          zurueck={() => setAnsicht(ZUM_SPIELPLAN)}
          logoAendern={async (gegner, png) => {
            const r = await ausfuehren(async () => { await repo.logoSetzen(gegner, png); return true as const })
            return r === true
          }}
          spielSpeichern={async (daten) => {
            const r = await ausfuehren(async () => { await repo.spielSpeichern(spielId, daten); return true as const },
              () => (spielId ? 'Gespeichert.' : 'Spiel eingetragen — alle sehen es auf der Startseite.'))
            return r === true
          }}
          loeschen={async () => {
            if (!spielId) return
            const r = await ausfuehren(async () => { await repo.spielLoeschen(spielId); return true as const }, () => 'Spiel gelöscht.')
            if (r) setAnsicht(ZUM_SPIELPLAN)
          }}
        />
      )}

      {ansicht.art === 'neu' && (
        <NeuerSpieler
          beschaeftigt={beschaeftigt}
          zurueck={() => setAnsicht(ZUM_KADER)}
          anlegen={async (eingabe) => {
            const r = await ausfuehren(() => repo.anlegen(pruefeEingabe(eingabe)))
            if (r) setAnsicht({ art: 'spieler', id: r.id, frisch: true })
          }}
        />
      )}

      {ansicht.art === 'spieler' && aktuell && (
        <SpielerAnsicht
          key={aktuell.spieler.id}
          eintrag={aktuell}
          frisch={!!ansicht.frisch}
          istIch={aktuell.spieler.id === sitzung?.spielerId}
          beschaeftigt={beschaeftigt}
          zurueck={() => setAnsicht(ZUM_KADER)}
          speichern={(eingabe) => ausfuehren(
            () => repo.aendern(aktuell.spieler.id, pruefeEingabe(eingabe)),
            () => 'Gespeichert.')}
          codeNeu={() => ausfuehren(
            () => repo.codeNeu(aktuell.spieler.id),
            () => 'Neuer Code für ' + vorname(aktuell.spieler.name) + '. Der alte gilt nicht mehr.')}
          sperreAufheben={() => ausfuehren(
            () => repo.sperreAufheben(aktuell.spieler.id),
            () => 'Sperre aufgehoben.')}
          geraeteAbmelden={() => ausfuehren(
            () => repo.geraeteAbmelden(aktuell.spieler.id),
            (n) => n === 1 ? 'Auf einem Gerät abgemeldet.' : 'Auf ' + n + ' Geräten abgemeldet.')}
          loeschen={async (mitEintraegen) => {
            const r = await ausfuehren(
              () => repo.loeschen(aktuell.spieler.id, mitEintraegen),
              (n) => vorname(aktuell.spieler.name) + ' ist raus aus dem Kader'
                + (n > 0 ? ', samt ' + (n === 1 ? 'seinem Eintrag' : 'seinen ' + n + ' Einträgen') : '') + '.')
            if (r !== undefined) setAnsicht(ZUM_KADER)
          }}
        />
      )}
    </div>
  )
}

// ── Liste ─────────────────────────────────────────────────────────────────

function Liste({ bereich, setBereich, kader, ladefehler, ichId, zurueck, neu, oeffnen, neuesSpiel, spielOeffnen }: {
  bereich: Bereich
  setBereich: (b: Bereich) => void
  kader: KaderEintrag[] | null
  ladefehler: string | null
  ichId?: string
  zurueck: () => void
  neu: () => void
  oeffnen: (id: string) => void
  neuesSpiel: () => void
  spielOeffnen: (id: string) => void
}) {
  const aktive = kader?.filter((k) => k.spieler.aktiv !== false) ?? []
  const ausgetreten = kader?.filter((k) => k.spieler.aktiv === false) ?? []

  return (
    <>
      <Zurueck text="Profil" onClick={zurueck} />
      <section>
        <h2 className="sec-title" style={{ marginBottom: 3 }}>Verwaltung</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          Nur für dich sichtbar. Für alle anderen bist du ein ganz normaler Spieler.
        </div>
      </section>

      <div className="seg" style={{ width: '100%' }}>
        {(['kader', 'spielplan'] as const).map((b) => (
          <label key={b} className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
            <input type="radio" name="verwaltung-bereich" checked={bereich === b} onChange={() => setBereich(b)} />
            <span>{b === 'kader' ? 'Kader' : 'Spielplan'}</span>
          </label>
        ))}
      </div>

      {bereich === 'spielplan' && <SpielplanListe neu={neuesSpiel} oeffnen={spielOeffnen} />}
      {bereich === 'kader' && <>
      <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15, marginTop: 0 }} onClick={neu}>
        Spieler hinzufügen
      </button>

      {ladefehler && <Leer>{ladefehler}</Leer>}
      {!ladefehler && !kader && <Leer dicht>Kader wird geladen …</Leer>}

      {kader && (
        <Sektion titel="Im Kader" hinweis={aktive.length === 1 ? '1 Person' : aktive.length + ' Personen'}>
          {aktive.length === 0
            ? <Leer dicht>Noch niemand angelegt.</Leer>
            : aktive.map((k) => <KaderZeile key={k.spieler.id} eintrag={k} istIch={k.spieler.id === ichId} oeffnen={oeffnen} />)}
        </Sektion>
      )}

      {ausgetreten.length > 0 && (
        <Sektion titel="Ausgetreten" hinweis="können sich nicht mehr anmelden">
          {ausgetreten.map((k) => <KaderZeile key={k.spieler.id} eintrag={k} istIch={false} oeffnen={oeffnen} />)}
        </Sektion>
      )}
      </>}
    </>
  )
}

function KaderZeile({ eintrag, istIch, oeffnen }: { eintrag: KaderEintrag; istIch: boolean; oeffnen: (id: string) => void }) {
  const p = eintrag.spieler
  const zusatz = [
    p.nummer !== undefined ? 'Nr. ' + p.nummer : null,
    p.rolle !== 'Spieler' ? p.rolle : null,
    eintrag.gesperrtBis ? 'gesperrt' : null,
    eintrag.geraete > 0 ? (eintrag.geraete === 1 ? '1 Gerät' : eintrag.geraete + ' Geräte') : null,
  ].filter(Boolean).join(' · ')

  return (
    <Tappable
      className="rule-b hover-neutral-200"
      onClick={() => oeffnen(p.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '11px 4px',
        color: p.aktiv === false ? 'var(--color-neutral-600)' : undefined,
      }}
    >
      <div className="cond profil-kuerzel" style={{ width: 34, height: 34, fontSize: 13 }}>{initialen(p.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="zeile-name">{p.name}{istIch && ' (du)'}</div>
        <div className="note" style={{ color: eintrag.gesperrtBis ? 'var(--color-accent-800)' : undefined }}>
          {zusatz || 'nicht angemeldet'}
        </div>
      </div>
      <span aria-hidden style={{ fontSize: 20, color: 'var(--color-neutral-400)' }}>›</span>
    </Tappable>
  )
}

// ── Ein Spieler ───────────────────────────────────────────────────────────

function SpielerAnsicht({ eintrag, frisch, istIch, beschaeftigt, zurueck, speichern, codeNeu, sperreAufheben, geraeteAbmelden, loeschen }: {
  eintrag: KaderEintrag
  frisch: boolean
  istIch: boolean
  beschaeftigt: boolean
  zurueck: () => void
  speichern: (e: SpielerEingabe) => Promise<unknown>
  codeNeu: () => Promise<unknown>
  sperreAufheben: () => Promise<unknown>
  geraeteAbmelden: () => Promise<unknown>
  loeschen: (mitEintraegen: boolean) => Promise<unknown>
}) {
  const kasse = useKasse()
  const p = eintrag.spieler
  // Wie viele Strafen den Mann betreffen — dieselbe Zahl, die die Datenbank
  // in strafe_spieler zählt und an der das Löschen hängt.
  const eintraege = kasse.daten.strafen.filter((s) => s.spielerIds.includes(p.id)).length
  const [eingabe, setEingabe] = useState<SpielerEingabe>(() => alsEingabe(p))
  const [rueckfrage, setRueckfrage] = useState<'code' | 'geraete' | 'loeschen' | null>(null)
  const [formFehler, setFormFehler] = useState<string | null>(null)

  const gesperrtBis = eintrag.gesperrtBis
    ? new Date(eintrag.gesperrtBis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null

  function absenden() {
    try {
      pruefeEingabe(eingabe)
      setFormFehler(null)
      void speichern(eingabe)
    } catch (e) {
      setFormFehler(fehlertext(e, 'Eingabe prüfen.'))
    }
  }

  return (
    <>
      <Zurueck text="Verwaltung" onClick={zurueck} />

      <section>
        <h2 className="sec-title" style={{ marginBottom: 3 }}>{p.name}{istIch && ' (du)'}</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          {p.rolle}{p.nummer !== undefined && ' · Nr. ' + p.nummer}{p.aktiv === false && ' · ausgetreten'}
        </div>
      </section>

      {frisch && (
        <div className="empty" style={{ padding: '12px 14px', borderStyle: 'solid', borderColor: 'var(--color-accent)', color: 'var(--color-accent-800)', textAlign: 'left' }}>
          Angelegt. Leite {vorname(p.name)} den Code gleich weiter — ohne ihn kommt niemand rein.
        </div>
      )}

      <Karte className="auf-accent" style={{ padding: '14px 16px 16px' }}>
        <div className="kicker-on-accent">Anmeldecode</div>
        <div className="cond code-gross">{eintrag.code || '—'}</div>

        {rueckfrage === 'code' ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 9 }}>
              Der alte Code gilt dann sofort nicht mehr. Angemeldete Geräte bleiben angemeldet.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn knopf-gelb" style={{ flex: 1 }} disabled={beschaeftigt}
                onClick={() => { setRueckfrage(null); void codeNeu() }}>
                Ja, neu würfeln
              </button>
              <button className="btn knopf-hell" onClick={() => setRueckfrage(null)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn knopf-gelb" style={{ flex: 1 }} disabled={!eintrag.code || beschaeftigt}
              onClick={() => void weiterleiten(p.name, eintrag.code, kasse.daten.verein.name, kasse.melde)}>
              Weiterleiten
            </button>
            <button className="btn knopf-hell" disabled={beschaeftigt} onClick={() => setRueckfrage('code')}>
              Neu würfeln
            </button>
          </div>
        )}
      </Karte>

      {gesperrtBis && (
        <Hinweiszeile
          text={`Nach ${eintrag.fehlversuche} Fehlversuchen gesperrt bis ${gesperrtBis} Uhr.`}
          knopf="Sperre aufheben"
          beschaeftigt={beschaeftigt}
          onClick={() => void sperreAufheben()}
        />
      )}

      {!istIch && eintrag.geraete > 0 && (rueckfrage === 'geraete' ? (
        <Karte style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 9 }}>
            {vorname(p.name)} wird überall abgemeldet und muss den Code neu eingeben.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={beschaeftigt}
              onClick={() => { setRueckfrage(null); void geraeteAbmelden() }}>
              Ja, überall abmelden
            </button>
            <button className="btn btn-secondary" onClick={() => setRueckfrage(null)}>Abbrechen</button>
          </div>
        </Karte>
      ) : (
        <Hinweiszeile
          text={eintrag.geraete === 1 ? 'Auf einem Gerät angemeldet.' : `Auf ${eintrag.geraete} Geräten angemeldet.`}
          knopf="Überall abmelden"
          beschaeftigt={beschaeftigt}
          onClick={() => setRueckfrage('geraete')}
        />
      ))}

      <Sektion titel="Stammdaten">
        <Formular eingabe={eingabe} setEingabe={setEingabe} istIch={istIch} mitStatus />
        {formFehler && <div className="formfehler" role="alert">{formFehler}</div>}
        <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15, marginTop: 14 }}
          disabled={beschaeftigt} onClick={absenden}>
          {beschaeftigt ? 'Speichert …' : 'Speichern'}
        </button>
      </Sektion>

      {!istIch && (
        <AusDemKader
          name={p.name}
          eintraege={eintraege}
          ausgetreten={p.aktiv === false}
          offen={rueckfrage === 'loeschen'}
          beschaeftigt={beschaeftigt}
          fragen={() => setRueckfrage('loeschen')}
          abbrechen={() => setRueckfrage(null)}
          loeschen={() => { setRueckfrage(null); void loeschen(eintraege > 0) }}
        />
      )}
    </>
  )
}

/**
 * Der letzte Block auf der Spielerseite: endgültig raus aus dem Kader.
 *
 * Wer Einträge in der Kasse hat, ist der Regelfall für „ausgetreten“ —
 * dann bleibt die Historie stehen. Löschen geht trotzdem, aber erst nach
 * einer Rückfrage, die sagt, was dabei mit verschwindet.
 */
function AusDemKader({ name, eintraege, ausgetreten, offen, beschaeftigt, fragen, abbrechen, loeschen }: {
  name: string
  eintraege: number
  ausgetreten: boolean
  offen: boolean
  beschaeftigt: boolean
  fragen: () => void
  abbrechen: () => void
  loeschen: () => void
}) {
  if (!offen) {
    return (
      <Hinweiszeile
        text={eintraege === 0
          ? `${vorname(name)} steht in keiner Strafe. Lässt sich rückstandslos entfernen.`
          : `${vorname(name)} hat ${eintraege === 1 ? 'einen Eintrag' : eintraege + ' Einträge'} in der Kasse.`}
        knopf="Aus dem Kader"
        beschaeftigt={beschaeftigt}
        onClick={fragen}
      />
    )
  }

  return (
    <Karte style={{ padding: '12px 14px', borderColor: 'var(--color-accent)' }}>
      <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
        {eintraege === 0 ? (
          <>{name} wird gelöscht, mit Code und Anmeldung. Kommt nicht wieder.</>
        ) : (
          <>
            {name} wird gelöscht — und mit ihm {eintraege === 1 ? 'sein Eintrag' : 'seine ' + eintraege + ' Einträge'}.
            Summen und Schandmauer ändern sich damit rückwirkend; an geteilten Strafen
            bleibt der Rest der Mannschaft stehen.
            {!ausgetreten && (
              <> Soll seine Historie erhalten bleiben, setz ihn oben stattdessen auf <em>ausgetreten</em>.</>
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={beschaeftigt} onClick={loeschen}>
          {eintraege === 0 ? 'Ja, löschen' : 'Ja, samt Einträgen'}
        </button>
        <button className="btn btn-secondary" onClick={abbrechen}>Abbrechen</button>
      </div>
    </Karte>
  )
}

function Hinweiszeile({ text, knopf, beschaeftigt, onClick }: {
  text: string; knopf: string; beschaeftigt: boolean; onClick: () => void
}) {
  return (
    <Karte style={{ padding: '11px 12px 11px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>{text}</div>
        <button className="btn btn-secondary" style={{ flex: 'none' }} disabled={beschaeftigt} onClick={onClick}>{knopf}</button>
      </div>
    </Karte>
  )
}

// ── Neuer Spieler ─────────────────────────────────────────────────────────

function NeuerSpieler({ beschaeftigt, zurueck, anlegen }: {
  beschaeftigt: boolean
  zurueck: () => void
  anlegen: (e: SpielerEingabe) => Promise<void>
}) {
  const [eingabe, setEingabe] = useState<SpielerEingabe>(LEERE_EINGABE)
  const [formFehler, setFormFehler] = useState<string | null>(null)

  function absenden() {
    try {
      pruefeEingabe(eingabe)
      setFormFehler(null)
      void anlegen(eingabe)
    } catch (e) {
      setFormFehler(fehlertext(e, 'Eingabe prüfen.'))
    }
  }

  return (
    <>
      <Zurueck text="Verwaltung" onClick={zurueck} />
      <section>
        <h2 className="sec-title" style={{ marginBottom: 3 }}>Neuer Spieler</h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          Den Anmeldecode würfelt die Kasse — du siehst ihn gleich danach.
        </div>
      </section>

      <Formular eingabe={eingabe} setEingabe={setEingabe} istIch={false} />
      {formFehler && <div className="formfehler" role="alert">{formFehler}</div>}

      <button className="btn btn-primary btn-block" style={{ padding: 13, fontSize: 15, marginTop: 0 }}
        disabled={beschaeftigt} onClick={absenden}>
        {beschaeftigt ? 'Wird angelegt …' : 'Anlegen und Code würfeln'}
      </button>
    </>
  )
}

// ── Bausteine ─────────────────────────────────────────────────────────────

function Formular({ eingabe, setEingabe, istIch, mitStatus = false }: {
  eingabe: SpielerEingabe
  setEingabe: (e: SpielerEingabe) => void
  istIch: boolean
  mitStatus?: boolean
}) {
  const setze = <K extends keyof SpielerEingabe>(k: K, v: SpielerEingabe[K]) => setEingabe({ ...eingabe, [k]: v })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div className="field">
        <label htmlFor="sp-name">Name</label>
        <input id="sp-name" className="input" type="text" autoComplete="off" autoCapitalize="words"
          value={eingabe.name} onChange={(e) => setze('name', e.target.value)} placeholder="Vorname Nachname" />
      </div>

      <div className="paar" style={{ gap: 11 }}>
        <div className="field" style={{ flex: 1.4, minWidth: 0 }}>
          <label htmlFor="sp-rolle">Rolle</label>
          <select id="sp-rolle" className="input" value={eingabe.rolle} disabled={istIch}
            onChange={(e) => setze('rolle', e.target.value as SpielerEingabe['rolle'])}>
            {ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="sp-nummer">Trikotnummer</label>
          <input id="sp-nummer" className="input" type="text" inputMode="numeric" maxLength={2}
            value={eingabe.nummer} onChange={(e) => setze('nummer', e.target.value.replace(/\D/g, ''))} placeholder="—" />
        </div>
      </div>

      <div className="paar" style={{ gap: 11 }}>
        <div className="field" style={{ flex: 1.4, minWidth: 0 }}>
          <label htmlFor="sp-position">Position</label>
          <input id="sp-position" className="input" type="text"
            value={eingabe.position} onChange={(e) => setze('position', e.target.value)} placeholder="optional" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="sp-geburtstag">Geburtstag</label>
          <input id="sp-geburtstag" className="input" type="text" inputMode="decimal" maxLength={6}
            value={eingabe.geburtstag} onChange={(e) => setze('geburtstag', e.target.value)} placeholder="TT.MM." />
        </div>
      </div>

      {eingabe.rolle === 'Admin' && !istIch && (
        <div className="note" style={{ fontSize: 12 }}>
          Admins dürfen alles, auch hier verwalten. Für die anderen erscheinen sie als Spieler.
        </div>
      )}

      {mitStatus && (
        <div className="field">
          <label>Status</label>
          <div className="seg" style={{ width: '100%' }}>
            <label className="seg-opt" style={{ flex: 1, justifyContent: 'center', opacity: istIch ? 0.5 : 1 }}>
              <input type="radio" name="sp-status" checked={eingabe.aktiv} disabled={istIch} onChange={() => setze('aktiv', true)} />
              <span>Im Kader</span>
            </label>
            <label className="seg-opt" style={{ flex: 1, justifyContent: 'center', opacity: istIch ? 0.5 : 1 }}>
              <input type="radio" name="sp-status" checked={!eingabe.aktiv} disabled={istIch} onChange={() => setze('aktiv', false)} />
              <span>Ausgetreten</span>
            </label>
          </div>
        </div>
      )}

      {istIch && (
        <div className="note" style={{ fontSize: 12 }}>
          Deine eigene Rolle und deinen Status ändert ein anderer Admin — sonst sperrst du dich aus.
        </div>
      )}
    </div>
  )
}

/**
 * Teilt den Code übers Handy (WhatsApp & Co.) — oder kopiert ihn, wo es
 * kein Teilen-Menü gibt.
 */
async function weiterleiten(name: string, code: string, verein: string, melde: (t: string) => void) {
  const text = `Hallo ${vorname(name)}! Dein Code für die Mannschaftskasse der ${verein}: ${code}\n${window.location.origin}`
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    melde('Kopiert — jetzt einfach in WhatsApp einfügen.')
  } catch {
    melde('Kopieren ging nicht. Der Code ist ' + code + '.')
  }
}
