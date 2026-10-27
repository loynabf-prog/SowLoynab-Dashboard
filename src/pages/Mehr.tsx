// "Mehr": alle Seiten, die nicht unten in der Leiste liegen -- in sieben
// Bereichen, jede Seite mit einem Satz. Ersetzt das alte Profil-Blatt, in
// dem 16 Seiten ohne Erklaerung untereinander standen. Oben: wer bin ich,
// Suche; unten: neu laden, abmelden.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { HAUPT_PFADE, sichtbareBereiche, type Seite } from '../lib/bereiche'
import { farbeVon, symbolVon } from '../lib/seitenSymbole'
import { allesVergessen } from '../lib/merken'
import AppIcon, { AppRaster } from '../components/AppIcon'

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
      <h1 className="h-gruss">Mehr</h1>

      <div className="n-segment" role="radiogroup" aria-label="Ich bin">
        {members.filter((m) => m.active !== false).map((m) => (
          <button key={m.id} className={m.id === memberId ? 'on' : ''} onClick={() => setMemberId(m.id)} role="radio" aria-checked={m.id === memberId}>
            {m.name}
          </button>
        ))}
      </div>

      <label className="mehr-suche">
        <Search size={18} />
        <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" aria-label="Seite suchen" />
      </label>

      {gruppen.length === 0 && <div className="col-empty">Nichts gefunden</div>}

      {/* Homebildschirm: ein Symbol je Seite, kein Erklaertext */}
      {gruppen.map((g) => (
        <AppRaster key={g.key} titel={g.label}>
          {g.key === gruppen[0].key && !suche && (
            <AppIcon icon={Sparkles} farbe="tinte" titel="Assistent" onClick={() => window.dispatchEvent(new Event('open-assistent'))} />
          )}
          {g.seiten.map((s) => (
            <AppIcon key={s.to} icon={symbolVon(s.to)} farbe={farbeVon(s.to)} titel={s.label} onClick={() => navigate(s.to)} />
          ))}
        </AppRaster>
      ))}

      <AppRaster titel={ich?.name ?? 'Konto'}>
        <AppIcon icon={RefreshCw} farbe="grau" titel="Neu laden" onClick={() => { allesVergessen(); window.location.reload() }} />
        <AppIcon icon={LogOut} farbe="rot" titel="Abmelden" onClick={() => signOut()} />
      </AppRaster>
      {user?.email && <p className="mehr-fuss">{user.email}</p>}
    </>
  )
}
