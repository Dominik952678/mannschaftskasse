import { useEffect, useState } from 'react'
import wappen from './assets/tsg-wappen.png'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { Kopfzeile } from './components/Kopfzeile'
import { TabLeiste } from './components/TabLeiste'
import type { TabId } from './components/TabLeiste'
import { AnmeldeScreen } from './screens/AnmeldeScreen'
import { EintragenScreen } from './screens/EintragenScreen'
import { HomeScreen } from './screens/HomeScreen'
import { KasseScreen } from './screens/KasseScreen'
import { ProfilScreen, ZahlenSheet } from './screens/ProfilScreen'
import { SpieltagScreen } from './screens/SpieltagScreen'
import { KasseProvider } from './store/KasseProvider'
import { useKasse } from './store/useKasse'

export default function App() {
  return (
    <AuthProvider>
      <Tor />
    </AuthProvider>
  )
}

/** Erst die Anmeldung, dann die Kasse. */
function Tor() {
  const { status, sitzung, fehler, nochmal } = useAuth()

  if (status === 'startet') {
    return <Hinweisschirm text="Kasse wird geöffnet …" />
  }
  if (status === 'fehler') {
    return (
      <Hinweisschirm text={fehler ?? 'Die Kasse ist nicht erreichbar.'}>
        <button className="btn btn-primary" style={{ padding: '11px 18px' }} onClick={nochmal}>
          Nochmal versuchen
        </button>
      </Hinweisschirm>
    )
  }
  if (!sitzung) {
    return <div className="app"><AnmeldeScreen /></div>
  }
  return (
    <KasseProvider key={sitzung.spielerId} sitzung={sitzung}>
      <Huelle />
    </KasseProvider>
  )
}

function Hinweisschirm({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="app hinweisschirm">
      <img src={wappen} alt="" width={64} height={64} style={{ objectFit: 'contain' }} />
      <div style={{ fontSize: 14, color: 'var(--color-neutral-700)', textAlign: 'center', maxWidth: 260 }}>{text}</div>
      {children}
    </div>
  )
}

/**
 * Die Hülle: Kopfzeile, der laufende Screen, die Tab-Leiste — und was
 * darüber liegt. Alles in einer Spalte, die genau den Bildschirm füllt;
 * gescrollt wird nur in der Mitte.
 */
function Huelle() {
  const kasse = useKasse()
  const [tab, setTab] = useState<TabId>('home')
  const [zahlenOffen, setZahlenOffen] = useState(false)

  // Den Spieltag rechnet nur der Trainer ab.
  const aktiv: TabId = tab === 'spieltag' && !kasse.darf.spieltagAbrechnen ? 'home' : tab

  useEffect(() => {
    if (!zahlenOffen) return
    const aufTaste = (e: KeyboardEvent) => { if (e.key === 'Escape') setZahlenOffen(false) }
    window.addEventListener('keydown', aufTaste)
    return () => window.removeEventListener('keydown', aufTaste)
  }, [zahlenOffen])

  function wechsle(ziel: TabId) {
    setTab(ziel)
    setZahlenOffen(false)
  }

  return (
    <div className="app">
      <Kopfzeile />

      {kasse.ladezustand === 'laedt' && (
        <div className="platzhalter">Kasse wird geladen …</div>
      )}

      {kasse.ladezustand === 'fehler' && (
        <div className="platzhalter">
          <div style={{ marginBottom: 12 }}>{kasse.ladefehler}</div>
          <button className="btn btn-primary" style={{ padding: '11px 18px' }} onClick={kasse.neuLaden}>
            Nochmal laden
          </button>
        </div>
      )}

      {kasse.ladezustand === 'bereit' && (
        <main className="inhalt tsg-scroll" key={aktiv}>
          {aktiv === 'home' && <HomeScreen aufProfil={() => wechsle('profil')} />}
          {aktiv === 'kasse' && <KasseScreen />}
          {aktiv === 'neu' && <EintragenScreen />}
          {aktiv === 'spieltag' && <SpieltagScreen />}
          {aktiv === 'profil' && <ProfilScreen aufZahlen={() => setZahlenOffen(true)} />}
        </main>
      )}

      <TabLeiste aktiv={aktiv} waehle={wechsle} mitSpieltag={kasse.darf.spieltagAbrechnen} />

      {zahlenOffen && <ZahlenSheet schliessen={() => setZahlenOffen(false)} />}

      {kasse.toast && (
        <div className="toast" role="status" aria-live="polite">{kasse.toast}</div>
      )}
    </div>
  )
}
