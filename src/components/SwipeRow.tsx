import { useRef, useState } from 'react'

// iOS-Style „nach links wischen zum Löschen":
//  - etwas nach links ziehen  -> roter „Löschen"-Knopf erscheint (antippen löscht)
//  - weit nach links ziehen    -> löscht automatisch (in den Papierkorb)
// Vertikales Scrollen bleibt unberührt (touch-action: pan-y).

const OPEN = 88          // Breite des offenen Löschen-Knopfs (px)
const COMMIT_RATIO = 0.5 // ab 50 % der Zeilenbreite: automatisch löschen
const MOVE_MIN = 8       // ab hier gilt es als Wischen (unterdrückt den Klick)

export default function SwipeRow({
  children,
  onDelete,
  label = 'Löschen',
  className = '',
}: {
  children: React.ReactNode
  onDelete: () => void
  label?: string
  className?: string
}) {
  const [reveal, setReveal] = useState(0)   // aktuell sichtbare rote Breite (px)
  const [dragging, setDragging] = useState(false)
  const [committing, setCommitting] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)
  const moved = useRef(false)
  const width = useRef(0)
  const openRef = useRef(false) // war die Zeile vor dem Tippen schon offen?
  const armedRef = useRef(false) // war die Schwelle „automatisch löschen" schon erreicht?

  const armed = width.current > 0 && reveal > width.current * COMMIT_RATIO

  function down(e: React.PointerEvent) {
    if (committing) return
    active.current = true
    moved.current = false
    startX.current = e.clientX
    startY.current = e.clientY
    width.current = e.currentTarget.getBoundingClientRect().width
    openRef.current = reveal > 0
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    setDragging(true)
  }

  function move(e: React.PointerEvent) {
    if (!active.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    // vertikales Scrollen gewinnt -> abbrechen
    if (!moved.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      active.current = false
      setDragging(false)
      setReveal(openRef.current ? OPEN : 0)
      return
    }
    if (Math.abs(dx) > MOVE_MIN) moved.current = true
    const base = openRef.current ? OPEN : 0
    const next = Math.max(0, Math.min(width.current, base - dx))
    // kleiner Vibrations-Tick beim Erreichen der Auto-Löschen-Schwelle
    const armedNow = next > width.current * COMMIT_RATIO
    if (armedNow !== armedRef.current) {
      armedRef.current = armedNow
      if (armedNow) { try { navigator.vibrate?.(9) } catch { /* ignore */ } }
    }
    setReveal(next)
  }

  function up() {
    if (!active.current) return
    active.current = false
    armedRef.current = false
    setDragging(false)
    if (reveal > width.current * COMMIT_RATIO) {
      // ganz weit gewischt -> automatisch löschen
      setCommitting(true)
      setReveal(width.current)
      setTimeout(onDelete, 180)
    } else if (reveal > OPEN * 0.6) {
      setReveal(OPEN) // offen stehen lassen
    } else {
      setReveal(0)    // zurückschnappen
    }
  }

  // nach einem Wisch den Klick auf den Inhalt schlucken
  function clickCapture(e: React.MouseEvent) {
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
      moved.current = false
    } else if (reveal > 0 && !committing) {
      // offen -> Tippen schließt zuerst
      e.preventDefault()
      e.stopPropagation()
      setReveal(0)
    }
  }

  return (
    <div className={`swipe-outer ${className}`}>
      <button
        type="button"
        className={`swipe-action ${armed ? 'armed' : ''}`}
        style={{ width: reveal }}
        onClick={() => { setCommitting(true); setReveal(width.current); setTimeout(onDelete, 120) }}
        tabIndex={reveal > 0 ? 0 : -1}
        aria-label={label}
      >
        <span className="swipe-action-label">🗑 {label}</span>
      </button>
      <div
        className={`swipe-content ${dragging ? 'swiping' : ''} ${committing ? 'committing' : ''}`}
        style={{ transform: `translateX(${-reveal}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
    </div>
  )
}
