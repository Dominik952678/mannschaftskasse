import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import type { Sitzung } from '../auth/typen'
import { ANFANGSDATEN } from '../data/anfang'
import { erzeugeRepository } from '../data/repositoryFabrik'
import type { SpieltagAbrechnung, StrafeNeu } from '../data/repository'
import { berechtigungen } from '../model/berechtigungen'
import { KATALOG_BY } from '../model/katalog'
import { fmtEur, heuteIso, vorname } from '../model/format'
import type { Einheit, KasseDaten } from '../model/types'
import { KasseContext } from './context'
import type { KasseStore, Ladezustand } from './context'

const LEER: KasseDaten = { ...ANFANGSDATEN, spieler: [], strafen: [], spiele: [], gegner: [] }

function fehlertext(e: unknown) {
  if (e instanceof Error && e.message) return e.message
  return 'Das hat die Kasse nicht angenommen. Nochmal versuchen?'
}

/**
 * Hält die Kasse und die Aktionen darauf. Gelesen und geschrieben wird über
 * ein Repository — im Speicher oder in Supabase, je nach Konfiguration.
 *
 * Nach jeder Änderung wird neu geladen. Das kostet bei Supabase eine Runde,
 * bringt dafür mit, was in der Zwischenzeit andere gebucht haben.
 */
export function KasseProvider({ sitzung, children }: { sitzung: Sitzung; children: ReactNode }) {
  const { abmelden: authAbmelden } = useAuth()
  const repository = useMemo(() => erzeugeRepository(sitzung), [sitzung])

  const [daten, setDaten] = useState<KasseDaten>(LEER)
  const [ladezustand, setLadezustand] = useState<Ladezustand>('laedt')
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [versuch, setVersuch] = useState(0)
  const [toast, setToast] = useState('')

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const melde = useCallback((text: string) => {
    clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  // Der Ladezustand startet auf 'laedt' und wird nur vom Ergebnis bewegt.
  // Ein Sitzungswechsel hängt einen frischen Provider ein (siehe App.tsx),
  // ein Neuladen setzt ihn im Klick-Handler zurück.
  useEffect(() => {
    let abgebrochen = false
    repository.laden()
      .then((frisch) => {
        if (abgebrochen) return
        setDaten(frisch)
        setLadezustand('bereit')
      })
      .catch((e: unknown) => {
        if (abgebrochen) return
        setLadefehler(fehlertext(e))
        setLadezustand('fehler')
      })
    return () => { abgebrochen = true }
  }, [repository, versuch])

  /** Schreiben, neu laden, Bescheid sagen — und bei Ärger nichts verändern. */
  async function mutieren(aktion: () => Promise<void>, erfolg: string) {
    setSpeichert(true)
    try {
      await aktion()
      setDaten(await repository.laden())
      melde(erfolg)
    } catch (e) {
      melde(fehlertext(e))
    } finally {
      setSpeichert(false)
    }
  }

  const spielerVonId = (id: string) => daten.spieler.find((p) => p.id === id) ?? null
  const ich = spielerVonId(sitzung.spielerId)
  const kassenwart = daten.spieler.find((p) => p.rolle === 'Kassenwart') ?? null
  const trainer = daten.spieler.find((p) => p.rolle === 'Trainer') ?? null

  const rolle = sitzung.rolle
  const darf = berechtigungen(rolle)

  const store: KasseStore = {
    daten, ladezustand, ladefehler, speichert,
    neuLaden: () => {
      setLadezustand('laedt')
      setLadefehler(null)
      setVersuch((n) => n + 1)
    },
    aktualisieren: async () => {
      try {
        setDaten(await repository.laden())
      } catch (e) {
        melde(fehlertext(e))
      }
    },

    ich, kassenwart, trainer, rolle, darf,
    spielerVonId,
    betrifftMich: (s) => s.spielerIds.includes(sitzung.spielerId),
    toast, melde,

    strafenAnlegen(spielerIds, typId, betrag, geteilt = false) {
      const k = KATALOG_BY[typId]
      if (!k || !spielerIds.length) return
      const datum = heuteIso()
      const neu: StrafeNeu[] = geteilt
        ? [{ spielerIds: [...spielerIds], typId, betrag, einheit: k.einheit, datum }]
        : spielerIds.map((id) => ({ spielerIds: [id], typId, betrag, einheit: k.einheit, datum }))

      const n = neu.length
      void mutieren(() => repository.strafenAnlegen(neu), darf.direktBuchen
        ? (n > 1 ? n + ' Einträge gesetzt und abgenickt.' : 'Eingetragen und abgenickt.')
        : (n > 1 ? n + ' Anträge raus. Jetzt müssen zwei nicken.' : 'Antrag raus. Jetzt müssen zwei nicken.'))
    },

    entscheiden(strafeId, bestaetigen) {
      if (!bestaetigen && !darf.ablehnen) {
        melde('Ablehnen darf nur der Kassenwart. Diskutier’s in der Kabine.')
        return
      }
      const vorher = daten.strafen.find((s) => s.id === strafeId)
      if (!vorher) return

      let text: string
      if (!bestaetigen) {
        const wer = spielerVonId(vorher.spielerIds[0])
        text = 'Abgelehnt. ' + (wer ? vorname(wer.name) : 'Er') + ' kommt diesmal davon.'
      } else if (darf.direktBuchen) {
        text = 'Abgenickt. Steht in der Kasse.'
      } else {
        const stimmen = vorher.bestaetigtVon.length + 1
        text = stimmen >= 2 ? 'Zweite Stimme — die Strafe steht.' : 'Deine Stimme zählt. Fehlt noch eine.'
      }
      void mutieren(() => repository.entscheiden(strafeId, bestaetigen), text)
    },

    abhaken(spielerId: string, einheit: Einheit) {
      const p = spielerVonId(spielerId)
      void mutieren(
        () => repository.abhaken(spielerId, einheit),
        (p ? vorname(p.name) : 'Er') + ' hat abgeliefert. Eingetragen.',
      )
    },

    erinnern(spielerId: string) {
      // TODO: echte Erinnerung verschicken, sobald Push oder Mail dranhängt.
      const p = spielerVonId(spielerId)
      melde('Erinnerung an ' + (p ? vorname(p.name) : 'ihn') + ' raus. Freundlich, aber bestimmt.')
    },

    spieltagAbrechnen(abrechnung: SpieltagAbrechnung) {
      const { tore, gegentore, kaderIds } = abrechnung
      if (!kaderIds.length) return melde('Ohne Kader keine Abrechnung.')
      if (!tore && !gegentore) return melde('0:0 — nichts zu holen. Ärgerlich für die Kasse.')

      const summe = gegentore * (KATALOG_BY.gegentor.satz ?? 0.5) * kaderIds.length
        + tore * (KATALOG_BY.tor.satz ?? 1)
      void mutieren(
        () => repository.spieltagAbrechnen(abrechnung),
        fmtEur(summe) + ' abgerechnet. ' + (gegentore ? 'Hinten bitte mal aufpassen.' : 'Saubere Kiste hinten.'),
      )
    },

    zahlungMelden(art) {
      // TODO: PayPal-Link öffnen bzw. dem Kassenwart Bescheid geben.
      const wer = kassenwart ? vorname(kassenwart.name) : null
      melde(art === 'paypal'
        ? 'PayPal-Link ' + (wer ? 'an ' + wer + ' ' : '') + 'raus. Abgehakt wird, sobald es da ist.'
        : (wer ? wer + ' weiß Bescheid. Bring’s Sonntag mit.' : 'Bar angekündigt. Bring’s Sonntag mit.'))
    },

    abmelden: () => void authAbmelden(),
  }

  return <KasseContext value={store}>{children}</KasseContext>
}
