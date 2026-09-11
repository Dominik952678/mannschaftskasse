import { IconHome, IconKasse, IconPfeife, IconPlus, IconProfil, Tappable } from './ui'
import type { ReactNode } from 'react'

export type TabId = 'home' | 'kasse' | 'neu' | 'spieltag' | 'profil'

type Eintrag = { id: TabId; label: string; icon: ReactNode }

export function TabLeiste({ aktiv, waehle, mitSpieltag }: {
  aktiv: TabId
  waehle: (id: TabId) => void
  mitSpieltag: boolean
}) {
  const tabs: Eintrag[] = [
    { id: 'home', label: 'TSG', icon: <IconHome /> },
    { id: 'kasse', label: 'Kasse', icon: <IconKasse /> },
    { id: 'neu', label: 'Eintragen', icon: <IconPlus /> },
    ...(mitSpieltag ? [{ id: 'spieltag' as const, label: 'Spieltag', icon: <IconPfeife /> }] : []),
    { id: 'profil', label: 'Profil', icon: <IconProfil /> },
  ]

  return (
    <nav className="tableiste" aria-label="Hauptnavigation">
      {tabs.map((t) => {
        const an = aktiv === t.id
        return (
          <Tappable
            key={t.id}
            gedrueckt={an}
            onClick={() => waehle(t.id)}
            className={an ? 'tab tab-an' : 'tab'}
          >
            <div style={{ width: 22, height: 22 }}>{t.icon}</div>
            <span className="cond tab-label">{t.label}</span>
          </Tappable>
        )
      })}
    </nav>
  )
}
