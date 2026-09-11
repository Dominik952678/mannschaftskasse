import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { auth } from './adapter'
import { AuthContext } from './context'
import type { AuthKontext, AuthStatus } from './context'
import type { Profil, Sitzung } from './typen'
import { fehlertext } from '../model/fehler'

/**
 * Hält die Anmeldung. Beim Start wird eine bestehende Sitzung gesucht;
 * gibt es keine, kommt die Profilauswahl. Welcher Adapter dahinter steckt
 * — lokal oder Supabase — entscheidet `adapter.ts`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('startet')
  const [sitzung, setSitzung] = useState<Sitzung | null>(null)
  const [profile, setProfile] = useState<Profil[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let abgebrochen = false

    async function start() {
      setStatus('startet')
      setFehler(null)
      try {
        await auth.starten()
        const vorhanden = await auth.sitzung()
        if (abgebrochen) return
        if (vorhanden) {
          setSitzung(vorhanden)
          setStatus('angemeldet')
          return
        }
        const liste = await auth.profile()
        if (abgebrochen) return
        setProfile(liste)
        setStatus('abgemeldet')
      } catch (e) {
        console.error(e)
        if (abgebrochen) return
        setFehler(fehlertext(e, 'Die Kasse ist nicht erreichbar.'))
        setStatus('fehler')
      }
    }

    void start()
    return () => { abgebrochen = true }
  }, [versuch])

  const anmelden = useCallback(async (spielerId: string, code: string) => {
    const ergebnis = await auth.anmelden(spielerId, code)
    if (ergebnis.ok) {
      setSitzung(ergebnis.sitzung)
      setStatus('angemeldet')
    }
    return ergebnis
  }, [])

  const abmelden = useCallback(async () => {
    await auth.abmelden()
    setSitzung(null)
    setStatus('startet')
    setVersuch((n) => n + 1)
  }, [])

  const kontext: AuthKontext = {
    status, sitzung, profile, fehler,
    quelle: auth.quelle,
    anmelden, abmelden,
    nochmal: () => setVersuch((n) => n + 1),
  }

  return <AuthContext value={kontext}>{children}</AuthContext>
}
