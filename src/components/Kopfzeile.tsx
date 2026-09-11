import wappen from '../assets/tsg-wappen.png'
import { useKasse } from '../store/useKasse'

export function Kopfzeile() {
  const { verein } = useKasse().daten
  const rolle = useKasse().rolle

  return (
    <header className="kopf">
      <img src={wappen} alt={verein.name} width={42} height={42} className="kopf-wappen" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cond kopf-titel">Mannschaftskasse</div>
        <div className="kopf-unter">{verein.mannschaft} · Saison {verein.saison}</div>
      </div>
      <div className="rollen-schild">{rolle}</div>
    </header>
  )
}
