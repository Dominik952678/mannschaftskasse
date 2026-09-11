import { useState } from 'react'
import { logoFuer } from '../model/berechnung'
import { kuerzel } from '../model/format'
import { useKasse } from '../store/useKasse'
import { Kuerzel } from './ui'

/**
 * Das Logo eines Gegners — oder, solange keins hochgeladen ist (oder es nicht
 * lädt), sein Kürzel. Auf den blauen Karten bekommt das Logo einen weißen
 * Grund, wie das eigene Wappen.
 */
export function GegnerLogo({ name, groesse, aufAccent = false }: {
  name: string
  groesse: number
  aufAccent?: boolean
}) {
  const { daten } = useKasse()
  const url = logoFuer(daten.gegner, name)
  const [kaputt, setKaputt] = useState<string | null>(null)

  if (!url || kaputt === url) return <Kuerzel text={kuerzel(name)} groesse={groesse} aktiv={aufAccent} />

  return (
    <img
      src={url}
      alt={name}
      width={groesse}
      height={groesse}
      loading="lazy"
      onError={() => setKaputt(url)}
      style={{
        width: groesse, height: groesse, flex: 'none', objectFit: 'contain',
        background: aufAccent ? '#fff' : undefined,
        padding: aufAccent ? 1 : 0,
      }}
    />
  )
}
