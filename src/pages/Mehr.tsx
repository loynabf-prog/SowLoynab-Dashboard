// "Mehr": alle Seiten, die nicht unten in der Leiste liegen -- in sieben
// Bereichen, jede Seite mit einem Satz. Ersetzt das alte Profil-Blatt, in
// dem 16 Seiten ohne Erklaerung untereinander standen. Oben: wer bin ich,
// Suche; unten: neu laden, abmelden.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { HAUPT_PFADE, sichtbareBereiche, type Seite } from '../lib/bereiche'
import { farbeVon, symbolVon } from '../lib/seitenSymbole'
import { allesVergessen } from '../lib/merken'

function passt(s: Seite, q: string): boolean {
  if (!q) return true
  const t = [s.label, s.was, ...(s.suche ?? [])].join(' ').toLowerCase()
  return q.split(/\s+/).every((w) => t.includes(w))
}

export default function Mehr() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { memberId, setMemberId } = useIdentity()
  const { members, byId } = useTeam()
  const [q, setQ] = useState('')
  const feld = useRef<HTMLInputElement>(null)
  const ich = memberId ? byId(memberId) : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== feld.current) { e.preventDefault(); feld.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const suche = q.trim().toLowerCase()
  const gruppen = useMemo(() => sichtbareBereiche(ich?.bereiche)
    .map((b) => ({ ...b, seiten: b.seiten.filter((s) => (suche ? true : !HAUPT_PFADE.includes(s.to)) && passt(s, suche)) }))
    .filter((b) => b.seiten.length > 0), [ich?.bereiche, suche])

  return (
    <>
      <div className="h-datum">Alle Bereiche</div>
      <h1 className="h-gruss">Mehr</h1>

      <div className="n-blatt-kopf mehr-kopf">
        <span className="n-avatar" style={{ background: ich?.color ?? 'var(--text-dim)' }}>{(ich?.name ?? '?').slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{ich?.name ?? 'Wer bist du?'}</strong>
          <span>{user?.email ?? ''}</span>
        </div>
      </div>
      <div className="n-segment" role="radiogroup" aria-label="Ich bin">
        {members.filter((m) => m.active !== false).map((m) => (
          <button key={m.id} className={m.id === memberId ? 'on' : ''} onClick={() => setMemberId(m.id)} role="radio" aria-checked={m.id === memberId}>
            {m.name}
          </button>
        ))}
      </div>

      <label className="mehr-suche">
        <Search size={18} />
        <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Seite suchen … (z. B. Rechnung, Dropbox)" aria-label="Seite suchen" />
      </label>

      <div className="n-gruppe mehr-assistent">
        <button className="n-zeile" onClick={() => window.dispatchEvent(new Event('open-assistent'))}>
          <span className="n-ic tinte"><Sparkles strokeWidth={2.1} /></span>
          <span className="n-text"><span className="n-titel">Assistent</span><span className="n-unter">Sag, was passieren soll — Kunde anlegen, Monat planen, Ideen</span></span>
          <ChevronRight className="n-chevron" />
        </button>
      </div>

      {gruppen.length === 0 && <div className="col-empty">Keine Seite passt zu „{q}“.</div>}

      {gruppen.map((g) => (
        <section key={g.key} className="mehr-bereich">
          <div className="n-seite-titel">{g.label}<small>{g.zweck}</small></div>
          <div className="n-gruppe">
            {g.seiten.map((s) => {
              const I = symbolVon(s.to)
              return (
                <button key={s.to} className="n-zeile" onClick={() => navigate(s.to)}>
                  <span className={`n-ic ${farbeVon(s.to)}`}><I strokeWidth={2.1} /></span>
                  <span className="n-text"><span className="n-titel">{s.label}</span><span className="n-unter">{s.was}</span></span>
                  <ChevronRight className="n-chevron" />
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <div className="n-seite-titel">Konto</div>
      <div className="n-gruppe">
        <button className="n-zeile" onClick={() => { allesVergessen(); window.location.reload() }}>
          <span className="n-ic grau"><RefreshCw strokeWidth={2.1} /></span>
          <span className="n-text"><span className="n-titel">Alles neu laden</span><span className="n-unter">Holt alle Daten frisch</span></span>
        </button>
        <button className="n-zeile" onClick={() => signOut()}>
          <span className="n-ic rot"><LogOut strokeWidth={2.1} /></span>
          <span className="n-text"><span className="n-titel">Abmelden</span></span>
        </button>
      </div>
    </>
  )
}
