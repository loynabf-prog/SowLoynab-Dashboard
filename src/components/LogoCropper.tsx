import { useMemo, useRef, useState } from 'react'
import Modal from './Modal'

const S = 280 // Groesse des quadratischen Zuschneide-Rahmens (px)
const OUT = 512 // Ausgabegroesse (quadratisch)

// Zuschneide-Dialog: Bild schieben + zoomen, damit das Logo mittig im
// quadratischen Rahmen sitzt. Ergebnis wird als quadratische PNG ausgegeben.
export default function LogoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel: () => void
  onDone: (cropped: File) => void
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const [nat, setNat] = useState({ w: 1, h: 1 })
  const [scale, setScale] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Grundgroesse: Bild deckt den Rahmen bei scale=1 gerade ab ("cover")
  const base = nat.w < nat.h ? { w: S, h: (S * nat.h) / nat.w } : { w: (S * nat.w) / nat.h, h: S }

  function onDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return
    setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })
  }
  function onUp() {
    drag.current = null
  }

  async function done() {
    const dispW = base.w * scale
    const dispH = base.h * scale
    const cx = S / 2 + off.x
    const cy = S / 2 + off.y
    const left = cx - dispW / 2
    const top = cy - dispH / 2
    const kx = nat.w / dispW
    const ky = nat.h / dispH
    const srcX = (0 - left) * kx
    const srcY = (0 - top) * ky
    const srcW = S * kx
    const srcH = S * ky

    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    const img = imgRef.current!
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT, OUT)
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    onDone(new File([blob], 'logo.png', { type: 'image/png' }))
  }

  return (
    <Modal title="Logo zuschneiden" onClose={onCancel}>
      <div className="stack">
        <p className="info-box">Ziehen zum Verschieben, Regler zum Zoomen — bis das Logo mittig im Rahmen sitzt.</p>
        <div
          className="crop-frame"
          style={{ width: S, height: S }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onWheel={(e) => setScale((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.0015)))}
        >
          <img
            ref={imgRef}
            src={url}
            alt="Logo"
            draggable={false}
            onLoad={(e) => {
              const im = e.currentTarget
              setNat({ w: im.naturalWidth, h: im.naturalHeight })
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: base.w,
              height: base.h,
              transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px) scale(${scale})`,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          <div className="crop-mask" />
        </div>

        <div className="row" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={done}>
            Übernehmen
          </button>
        </div>
      </div>
    </Modal>
  )
}
