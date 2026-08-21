import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Hit {
  kind: 'client' | 'lead' | 'task'
  id: string
  label: string
  sub?: string
  to: string
  icon: string
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Strg+K global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    // per Event von außen öffnen (Header-Knopf)
    function openEvt() { setOpen(true) }
    window.addEventListener('open-search', openEvt as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-search', openEvt as EventListener)
    }
  }, [])

  // Daten laden, wenn geöffnet
  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 40)
    async function load() {
      const [c, l, t] = await Promise.all([
        supabase.from('clients').select('id, name, handle_ig').is('deleted_at', null).order('name'),
        supabase.from('leads').select('id, name, city, stage').is('deleted_at', null).order('name'),
        supabase.from('tasks').select('id, title, done').is('deleted_at', null).eq('done', false),
      ])
      const list: Hit[] = []
      for (const x of (c.data ?? []) as any[]) list.push({ kind: 'client', id: x.id, label: x.name, sub: x.handle_ig ? '@' + x.handle_ig.replace(/^@/, '') : 'Kunde', to: `/client/${x.id}`, icon: '👤' })
      for (const x of (l.data ?? []) as any[]) list.push({ kind: 'lead', id: x.id, label: x.name, sub: x.city || 'Lead', to: '/leads', icon: '🎯' })
      for (const x of (t.data ?? []) as any[]) list.push({ kind: 'task', id: x.id, label: x.title, sub: 'Aufgabe', to: '/aufgaben', icon: '✓' })
      setHits(list)
    }
    load()
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = s ? hits.filter((h) => h.label.toLowerCase().includes(s) || (h.sub ?? '').toLowerCase().includes(s)) : hits
    return base.slice(0, 24)
  }, [q, hits])

  useEffect(() => { setActive(0) }, [q])

  function go(h: Hit | undefined) {
    if (!h) return
    setOpen(false)
    navigate(h.to)
  }

  if (!open) return null

  return createPortal(
    <div className="cmd-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <span className="cmd-mag">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kunde, Lead oder Aufgabe suchen …"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
            }}
          />
          <kbd className="cmd-esc">esc</kbd>
        </div>
        {!q.trim() && (
          <div className="cmd-actions">
            <button className="cmd-action" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-quickadd', { detail: { type: 'task' } })) }}>＋ Aufgabe</button>
            <button className="cmd-action" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-quickadd', { detail: { type: 'lead' } })) }}>＋ Lead</button>
            <button className="cmd-action" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-quickadd', { detail: { type: 'video' } })) }}>＋ Video</button>
          </div>
        )}
        <div className="cmd-list">
          {results.length === 0 && <div className="cmd-empty">{hits.length === 0 ? 'Lade …' : 'Nichts gefunden.'}</div>}
          {results.map((h, i) => (
            <button
              key={h.kind + h.id}
              className={`cmd-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
            >
              <span className="cmd-icon">{h.icon}</span>
              <span className="cmd-label">{h.label}</span>
              <span className="cmd-sub">{h.sub}</span>
            </button>
          ))}
        </div>
        <div className="cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> wählen</span>
          <span><kbd>↵</kbd> öffnen</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> Suche</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
