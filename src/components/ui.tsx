import type { CSSProperties, ReactNode } from 'react'

/** Registermarken des Blueprint-Rahmens — eine je Ecke. */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  )
}

/** Karte im Blueprint-Stil: Haarlinie plus Registermarken. */
export function Karte({ className = '', style, children }: {
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={'blueprint ' + className} style={style}>
      <Corners />
      {children}
    </div>
  )
}

/** Überschrift einer Sektion, optional mit Zusatz rechts daneben. */
export function Sektion({ titel, hinweis, children }: {
  titel: string
  hinweis?: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="sec-head">
        <h2 className="sec-title">{titel}</h2>
        {hinweis && <span className="note">{hinweis}</span>}
      </div>
      {children}
    </section>
  )
}

/** Platzhalter für eine Liste, in der noch nichts steht. */
export function Leer({ children, dicht = false }: { children: ReactNode; dicht?: boolean }) {
  return <div className="empty" style={{ padding: dicht ? '14px 12px' : '20px 14px' }}>{children}</div>
}

type TappableProps = {
  onClick?: () => void
  className?: string
  style?: CSSProperties
  label?: string
  gedrueckt?: boolean
  children?: ReactNode
}

/** Antippbare Fläche, die sich wie ein Button verhält — auch per Tastatur. */
export function Tappable({ onClick, className, style, label, gedrueckt, children }: TappableProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={gedrueckt}
      className={className ? 'tap ' + className : 'tap'}
      style={style}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {children}
    </div>
  )
}

/** Zurück-Link oben in Unteransichten. */
export function Zurueck({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <Tappable className="zurueck" onClick={onClick} label={'Zurück zu ' + text}>
      ‹ {text}
    </Tappable>
  )
}

/** Quadratisches Kürzel-Feld, das überall dort steht, wo ein Wappen fehlt. */
export function Kuerzel({ text, groesse, aktiv = false }: { text: string; groesse: number; aktiv?: boolean }) {
  return (
    <div
      className="cond"
      style={{
        width: groesse, height: groesse, flex: 'none',
        border: '1px solid ' + (aktiv ? 'rgba(255,255,255,0.45)' : 'var(--color-divider)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(groesse * 0.4),
        color: aktiv ? 'rgba(255,255,255,0.9)' : 'var(--color-neutral-700)',
      }}
    >
      {text}
    </div>
  )
}

const strichSvg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  width: 22,
  height: 22,
} as const

export function IconHome() {
  return <svg {...strichSvg} strokeWidth={1.5}><path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" /></svg>
}

export function IconKasse() {
  return (
    <svg {...strichSvg} strokeWidth={1.5}>
      <rect x="3" y="6" width="18" height="13" />
      <path d="M3 10h18M16.5 14.5h2" />
    </svg>
  )
}

export function IconPlus() {
  return <svg {...strichSvg} strokeWidth={1.5}><path d="M12 5v14M5 12h14" /></svg>
}

export function IconProfil() {
  return (
    <svg {...strichSvg} strokeWidth={1.5}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c1.3-3.7 4.1-5.5 7.5-5.5s6.2 1.8 7.5 5.5" />
    </svg>
  )
}

export function IconPfeife() {
  return (
    <svg {...strichSvg} strokeWidth={1.5}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17" />
    </svg>
  )
}

export function IconCheck({ size = 15, width = 1.8, opacity = 1 }: { size?: number; width?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} style={{ opacity }}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

export function IconClose({ size = 15, width = 1.5 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
