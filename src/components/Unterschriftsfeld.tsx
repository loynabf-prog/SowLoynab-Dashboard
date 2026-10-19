import { useEffect, useRef, useState } from 'react'

// Feld zum Unterschreiben mit dem Finger, dem Stift oder der Maus.
//
// Bewusst klein gehalten: feste Innenauflösung, damit das PNG ein paar
// Kilobyte bleibt und direkt im Vertrag gespeichert werden kann.
const BREITE = 600
const HOEHE = 200

export interface UnterschriftsfeldProps {
  onChange: (datenUrl: string | null) => void
  disabled?: boolean
}

export default function Unterschriftsfeld({ onChange, disabled }: UnterschriftsfeldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const zeichnet = useRef(false)
  const letzter = useRef<{ x: number; y: number } | null>(null)
  const [leer, setLeer] = useState(true)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = BREITE
    c.height = HOEHE
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // IMMER schwarz zeichnen. Was hier im Canvas landet, wandert so ins PDF --
    // ein heller Strich waere auf weissem Papier unsichtbar. Dass man im
    // Dunkelmodus trotzdem etwas sieht, macht das Stylesheet mit einem Filter
    // auf dem Canvas; die gespeicherten Bilddaten bleiben davon unberuehrt.
    ctx.strokeStyle = '#1d1d1f'
  }, [])

  function punkt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * BREITE,
      y: ((e.clientY - r.top) / r.height) * HOEHE,
    }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    zeichnet.current = true
    letzter.current = punkt(e)
  }

  function ziehen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !letzter.current) return
    const p = punkt(e)
    ctx.beginPath()
    ctx.moveTo(letzter.current.x, letzter.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    letzter.current = p
    if (leer) setLeer(false)
  }

  function ende(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return
    e.preventDefault()
    zeichnet.current = false
    letzter.current = null
    const c = canvasRef.current
    if (c) onChange(c.toDataURL('image/png'))
  }

  function leeren() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, BREITE, HOEHE)
    setLeer(true)
    onChange(null)
  }

  return (
    <div className="unterschrift">
      <div className="unterschrift-feld">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={ziehen}
          onPointerUp={ende}
          onPointerCancel={ende}
          onPointerLeave={ende}
        />
        {leer && <span className="unterschrift-hinweis">Hier mit dem Finger unterschreiben</span>}
        <span className="unterschrift-linie" />
      </div>
      <div className="unterschrift-leiste">
        <span className="muted">{leer ? 'Noch nichts gezeichnet' : 'Unterschrift erfasst'}</span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm" onClick={leeren} disabled={leer || disabled}>
          Nochmal
        </button>
      </div>
    </div>
  )
}
