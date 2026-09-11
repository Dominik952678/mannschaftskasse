/** Kantenlänge, auf die Logos verkleinert werden — reicht für jede Anzeige. */
const LOGO_PX = 256

/**
 * Macht aus einem beliebigen Bild (Foto, Screenshot, SVG von der Vereinsseite)
 * ein kleines PNG. So geht der Upload auch im Kabinen-WLAN schnell, und in den
 * Storage kommt nur ein Format, das sich sicher anzeigen lässt.
 */
export async function logoVorbereiten(datei: File): Promise<Blob> {
  if (!datei.type.startsWith('image/')) throw new Error('Das ist kein Bild.')
  if (datei.size > 15 * 1024 * 1024) throw new Error('Das Bild ist zu groß (höchstens 15 MB).')

  const url = URL.createObjectURL(datei)
  try {
    const bild = await new Promise<HTMLImageElement>((gut, schlecht) => {
      const i = new Image()
      i.onload = () => gut(i)
      i.onerror = () => schlecht(new Error('Das Bild lässt sich nicht öffnen.'))
      i.src = url
    })
    const faktor = Math.min(1, LOGO_PX / Math.max(bild.naturalWidth || LOGO_PX, bild.naturalHeight || LOGO_PX))
    const breite = Math.max(1, Math.round((bild.naturalWidth || LOGO_PX) * faktor))
    const hoehe = Math.max(1, Math.round((bild.naturalHeight || LOGO_PX) * faktor))

    const leinwand = document.createElement('canvas')
    leinwand.width = breite
    leinwand.height = hoehe
    const ctx = leinwand.getContext('2d')
    if (!ctx) throw new Error('Das Bild ließ sich nicht umwandeln.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bild, 0, 0, breite, hoehe)

    const png = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, 'image/png'))
    if (!png) throw new Error('Das Bild ließ sich nicht umwandeln.')
    return png
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Dateiname im Bucket: "fv-engers-ii-3f9a1c2e.png" — neu bei jedem Upload, damit kein Cache das alte Logo zeigt. */
export function logoDateiname(gegner: string): string {
  const basis = gegner.toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'gegner'
  const zufall = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${basis}-${zufall}.png`
}
