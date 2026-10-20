// Die Schale der App: Handy-Leiste unten, Seitenleiste am Desktop.
// ---------------------------------------------------------------------------
// Unten genau vier Ziele und in der Mitte der Knopf fuer Neues -- zwei links,
// zwei rechts, symmetrisch. Alles, was man selten braucht, liegt hinter dem
// Profilbild oben rechts, wie die Einstellungen am iPhone. Wer einem
// Mitglied nur bestimmte Bereiche gibt (lib/bereiche.ts), sieht dort auch
// nur diese.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Sun, CalendarDays, Clapperboard, Users, Plus, Search, Sparkles, ChevronRight,
  LogOut, Calendar, Mail, BarChart3, TrendingUp, Target, ListChecks,
  ReceiptEuro, Wallet, Bookmark, UserRound, Settings, Trash2, FolderOpen, CalendarRange } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { sichtbareBereiche } from '../lib/bereiche'
import AssistentButton from './AssistentButton'
import NudgeCenter from './NudgeCenter'
import CommandPalette from './CommandPalette'
import QuickAdd from './QuickAdd'
import UpdatePrompt from './UpdatePrompt'

interface Ziel { to: string; label: string; icon: LucideIcon; end?: boolean; auch?: string[] }

/** Die vier Hauptziele -- in dieser Reihenfolge, links zwei, rechts zwei. */
const HAUPT: Ziel[] = [
  { to: '/', label: 'Heute', icon: Sun, end: true },
  { to: '/plan', label: 'Plan', icon: CalendarDays, auch: ['/posting'] },
  { to: '/produktion', label: 'Produktion', icon: Clapperboard, auch: ['/medien'] },
  { to: '/kunden', label: 'Kunden', icon: Users, auch: ['/client'] },
]

/** Symbole fuer die selteneren Seiten im Profil-Blatt. */
const SYMBOL: Record<string, LucideIcon> = {
  '/kalender': Calendar, '/postfach': Mail, '/analyse': BarChart3, '/leistung': TrendingUp,
  '/leads': Target, '/aufgaben': ListChecks, '/rechnungen': ReceiptEuro, '/finanzen': Wallet,
  '/inspirationen': Bookmark, '/team': UserRound, '/einstellungen': Settings, '/papierkorb': Trash2,
  '/medien': FolderOpen, '/monate': CalendarRange,
}
const HAUPT_PFADE = ['/', '/plan', '/posting', '/produktion', '/kunden', '/medien']

/** Farben fuer die Symbole im Profil-Blatt, wie in den iPhone-Einstellungen. */
const FARBE: Record<string, string> = {
  '/kalender': 'rot', '/postfach': 'blau', '/analyse': 'blau', '/leistung': 'gruen',
  '/leads': 'glut', '/aufgaben': 'gelb', '/rechnungen': 'gruen', '/finanzen': 'gruen',
  '/inspirationen': 'lila', '/team': 'blau', '/einstellungen': 'grau', '/papierkorb': 'grau',
  '/monate': 'glut',
}

function aktiv(z: Ziel, pfad: string): boolean {
  if (z.end) return pfad === z.to
  return [z.to, ...(z.auch ?? [])].some((p) => pfad === p || pfad.startsWith(p + '/'))
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const location = useLocation()
  const [blatt, setBlatt] = useState(false)

  useEffect(() => { setBlatt(false) }, [location.pathname])

  const ich = memberId ? byId(memberId) : undefined
  const bereiche = sichtbareBereiche(ich?.bereiche)
  // Alles ausser den Hauptzielen, gruppiert nach Bereich.
  const gruppen = bereiche
    .map((b) => ({ titel: b.label, seiten: b.seiten.filter((s) => !HAUPT_PFADE.includes(s.to)) }))
    .filter((g) => g.seiten.length > 0)
  const breit = location.pathname.startsWith('/client/') || location.pathname === '/kalender'
  const animKey = location.pathname.startsWith('/client/') ? 'client' : location.pathname

  const neu = () => window.dispatchEvent(new Event('open-quickadd'))

  return (
    <div className="n-schale">
      {/* Desktop: Seitenleiste */}
      <aside className="n-seite" aria-label="Navigation">
        <Link to="/" className="n-marke"><i>S&amp;L</i>Sow &amp; Loynab</Link>
        <button className="n-seite-neu" onClick={neu}><Plus size={17} strokeWidth={2.4} />Neu</button>
        {HAUPT.map((z) => (
          <NavLink key={z.to} to={z.to} end={z.end} className={() => `n-seite-link ${aktiv(z, location.pathname) ? 'on' : ''}`}>
            <z.icon strokeWidth={2} />{z.label}
          </NavLink>
        ))}
        <NavLink to="/kalender" className={({ isActive }) => `n-seite-link ${isActive ? 'on' : ''}`}>
          <Calendar strokeWidth={2} />Kalender
        </NavLink>
        {gruppen.map((g) => (
          <div key={g.titel}>
            <div className="n-seite-titel">{g.titel}</div>
            {g.seiten.map((s) => {
              const I = SYMBOL[s.to] ?? ChevronRight
              return (
                <NavLink key={s.to} to={s.to} className={({ isActive }) => `n-seite-link ${isActive ? 'on' : ''}`}>
                  <I strokeWidth={2} />{s.label}
                </NavLink>
              )
            })}
          </div>
        ))}
      </aside>

      {/* Kopf: Marke links (Handy), rechts die wenigen Werkzeuge */}
      <header className="n-kopf">
        <Link to="/" className="n-marke"><i>S&amp;L</i>Sow &amp; Loynab</Link>
        <span className="n-spacer" />
        <button className="n-kopf-knopf" onClick={() => window.dispatchEvent(new Event('open-assistent'))} aria-label="Assistent" title="Assistent (⌘J)">
          <Sparkles size={21} strokeWidth={2} />
        </button>
        <button className="n-kopf-knopf" onClick={() => window.dispatchEvent(new Event('open-search'))} aria-label="Suchen" title="Suchen (⌘K)">
          <Search size={21} strokeWidth={2} />
        </button>
        <NudgeCenter />
        <button
          className="n-avatar"
          style={{ background: ich?.color ?? 'var(--text-dim)' }}
          onClick={() => setBlatt(true)}
          aria-label="Profil und weitere Seiten"
        >
          {(ich?.name ?? '?').slice(0, 1).toUpperCase()}
        </button>
      </header>

      <main className={`n-inhalt ${breit ? 'breit' : ''}`}>
        <div className="page" key={animKey}>{children}</div>
      </main>

      {/* Handy: fuenf gleich breite Spalten -- zwei, Neu, zwei */}
      <nav className="n-leiste" aria-label="Hauptnavigation">
        {HAUPT.slice(0, 2).map((z) => <Tab key={z.to} z={z} pfad={location.pathname} />)}
        <button className="n-neu" onClick={neu} aria-label="Neu anlegen"><Plus strokeWidth={2.6} /></button>
        {HAUPT.slice(2).map((z) => <Tab key={z.to} z={z} pfad={location.pathname} />)}
      </nav>

      {blatt && (
        <ProfilBlatt
          gruppen={gruppen}
          email={user?.email ?? ''}
          onClose={() => setBlatt(false)}
          onSignOut={() => signOut()}
        />
      )}

      <AssistentButton />
      <CommandPalette />
      <QuickAdd />
      <UpdatePrompt />
    </div>
  )
}

function Tab({ z, pfad }: { z: Ziel; pfad: string }) {
  const on = aktiv(z, pfad)
  return (
    <NavLink to={z.to} end={z.end} className={() => `n-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
      <z.icon strokeWidth={on ? 2.3 : 1.9} />
      <span>{z.label}</span>
    </NavLink>
  )
}

function ProfilBlatt({ gruppen, email, onClose, onSignOut }: {
  gruppen: { titel: string; seiten: { to: string; label: string }[] }[]
  email: string
  onClose: () => void
  onSignOut: () => void
}) {
  const navigate = useNavigate()
  const { memberId, setMemberId } = useIdentity()
  const { members, byId } = useTeam()
  const ich = memberId ? byId(memberId) : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="n-blatt-hinten" onClick={onClose} />
      <div className="n-blatt" role="dialog" aria-label="Profil">
        <div className="n-blatt-griff" />
        <div className="n-blatt-kopf">
          <span className="n-avatar" style={{ background: ich?.color ?? 'var(--text-dim)' }}>{(ich?.name ?? '?').slice(0, 1)}</span>
          <div>
            <strong>{ich?.name ?? 'Wer bist du?'}</strong>
            <span>{email}</span>
          </div>
        </div>

        {/* Wer bin ich? Bestimmt, welcher Tag auf "Heute" erscheint. */}
        <div className="n-segment" role="radiogroup" aria-label="Ich bin">
          {members.filter((m) => m.active !== false).map((m) => (
            <button key={m.id} className={m.id === memberId ? 'on' : ''} onClick={() => setMemberId(m.id)} role="radio" aria-checked={m.id === memberId}>
              {m.name}
            </button>
          ))}
        </div>

        {[{ titel: 'Allgemein', seiten: [{ to: '/kalender', label: 'Kalender' }] }, ...gruppen].map((g) => (
          <div key={g.titel} style={{ marginBottom: 18 }}>
            <div className="n-seite-titel" style={{ margin: '0 4px 6px', fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>{g.titel}</div>
            <div className="n-gruppe">
              {g.seiten.map((s) => {
                const I = SYMBOL[s.to] ?? ChevronRight
                return (
                  <button key={s.to} className="n-zeile" onClick={() => { onClose(); navigate(s.to) }}>
                    <span className={`n-ic ${FARBE[s.to] ?? 'grau'}`}><I strokeWidth={2.1} /></span>
                    <span className="n-text"><span className="n-titel">{s.label}</span></span>
                    <ChevronRight className="n-chevron" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="n-gruppe">
          <button className="n-zeile" onClick={() => { onClose(); onSignOut() }}>
            <span className="n-ic rot"><LogOut strokeWidth={2.1} /></span>
            <span className="n-text"><span className="n-titel">Abmelden</span></span>
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
