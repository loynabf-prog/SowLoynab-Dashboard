import { useEffect, useRef, useState } from 'react'

// Pointer-basiertes Drag & Drop für Kanban-Boards — funktioniert mit Finger
// (iPhone/iPad) UND Maus. Zieht eine schwebende Kopie der Karte, erkennt Spalte
// und Einfüge-Position, scrollt am Rand automatisch. Ziehen startet erst nach
// einer kleinen Bewegungs-Schwelle -> reines Antippen bleibt sauber.
//
// Verkabelung im Markup:
//   - Spalte:  data-lane="<laneKey>"
//   - Karte:   data-card="<itemId>"  (innerhalb der Spalte)
//   - Griff:   onPointerDown={(e) => startDrag(e, itemId, laneKey)}  + CSS touch-action:none
//
// onDrop(itemId, lane, beforeId) — beforeId = ID der Karte, VOR der eingefügt wird
// (oder null = ans Ende der Spalte).

export interface DropInfo {
  lane: string
  beforeId: string | null
}

interface DragState {
  id: string
  ghost: HTMLElement
  offX: number
  offY: number
  drop: DropInfo | null
}

interface Pending {
  id: string
  wrap: HTMLElement
  startX: number
  startY: number
}

const THRESHOLD = 6 // px Bewegung, bevor das Ziehen startet

export function usePointerBoard(onDrop: (itemId: string, lane: string, beforeId: string | null) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropInfo | null>(null)
  const st = useRef<DragState | null>(null)
  const pending = useRef<Pending | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    let scrollDir = 0
    let scrollRAF = 0
    function tickScroll() {
      if (scrollDir !== 0) {
        window.scrollBy(0, scrollDir)
        scrollRAF = requestAnimationFrame(tickScroll)
      } else {
        scrollRAF = 0
      }
    }

    function beginDrag(p: Pending, clientX: number, clientY: number) {
      const rect = p.wrap.getBoundingClientRect()
      const ghost = p.wrap.cloneNode(true) as HTMLElement
      const srcFields = p.wrap.querySelectorAll('input, textarea, select')
      const dstFields = ghost.querySelectorAll('input, textarea, select')
      srcFields.forEach((s, i) => {
        const d = dstFields[i] as HTMLInputElement | undefined
        if (d) d.value = (s as HTMLInputElement).value
      })
      ghost.classList.add('drag-ghost')
      ghost.style.position = 'fixed'
      ghost.style.left = '0'
      ghost.style.top = '0'
      ghost.style.width = rect.width + 'px'
      ghost.style.margin = '0'
      ghost.style.pointerEvents = 'none'
      ghost.style.zIndex = '99998'
      ghost.style.willChange = 'transform'
      const offX = p.startX - rect.left
      const offY = p.startY - rect.top
      ghost.style.transform = `translate3d(${clientX - offX}px, ${clientY - offY}px, 0) rotate(-2.5deg) scale(1.04)`
      document.body.appendChild(ghost)
      st.current = { id: p.id, ghost, offX, offY, drop: null }
      pending.current = null
      setDragId(p.id)
    }

    function move(e: PointerEvent) {
      // Schwelle: erst ab kleiner Bewegung wirklich ziehen
      const p = pending.current
      if (p && !st.current) {
        if (Math.abs(e.clientX - p.startX) + Math.abs(e.clientY - p.startY) < THRESHOLD) return
        beginDrag(p, e.clientX, e.clientY)
      }
      const s = st.current
      if (!s) return
      e.preventDefault()
      s.ghost.style.transform =
        `translate3d(${e.clientX - s.offX}px, ${e.clientY - s.offY}px, 0) rotate(-2.5deg) scale(1.04)`

      const vh = window.innerHeight
      if (e.clientY < 96) scrollDir = -Math.ceil((96 - e.clientY) / 6)
      else if (e.clientY > vh - 96) scrollDir = Math.ceil((e.clientY - (vh - 96)) / 6)
      else scrollDir = 0
      if (scrollDir !== 0 && !scrollRAF) scrollRAF = requestAnimationFrame(tickScroll)

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const laneEl = el?.closest('[data-lane]') as HTMLElement | null
      if (!laneEl) {
        if (s.drop) { s.drop = null; setDrop(null) }
        return
      }
      const lane = laneEl.getAttribute('data-lane') || ''
      const cards = Array.from(laneEl.querySelectorAll('[data-card]')) as HTMLElement[]
      let beforeId: string | null = null
      for (const c of cards) {
        if (c.getAttribute('data-card') === s.id) continue
        const r = c.getBoundingClientRect()
        if (e.clientY < r.top + r.height / 2) { beforeId = c.getAttribute('data-card'); break }
      }
      if (!s.drop || s.drop.lane !== lane || s.drop.beforeId !== beforeId) {
        s.drop = { lane, beforeId }
        setDrop(s.drop)
      }
    }

    function up() {
      const s = st.current
      scrollDir = 0
      if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = 0 }
      pending.current = null
      if (s) {
        s.ghost.remove()
        if (s.drop) onDropRef.current(s.id, s.drop.lane, s.drop.beforeId)
      }
      st.current = null
      setDragId(null)
      setDrop(null)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (scrollRAF) cancelAnimationFrame(scrollRAF)
    }
  }, [])

  function startDrag(e: React.PointerEvent, itemId: string, _lane: string) {
    if (e.button != null && e.button > 0) return
    const wrap = (e.currentTarget as HTMLElement).closest('[data-card]') as HTMLElement | null
    if (!wrap) return
    e.stopPropagation()
    pending.current = { id: itemId, wrap, startX: e.clientX, startY: e.clientY }
  }

  return { dragId, drop, startDrag }
}
