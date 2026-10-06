// Der Abo-Link einer Person -- kopieren, antippen, neu erzeugen.
// ---------------------------------------------------------------------------
// Der Link ist ein Passwort: wer ihn hat, sieht den Dienstplan, ohne sich
// anzumelden. Deshalb steht er standardmaessig verdeckt da und laesst sich
// jederzeit neu erzeugen -- damit ist das Abo auf einem verlorenen Handy
// sofort tot.

import { useState } from 'react'
import type { TeamMember } from '../lib/types'
import { aboUrl, neuerSchluessel } from '../lib/kalenderAbo'
import { useToast } from '../context/ToastContext'

export default function KalenderAbo({ member, onNeu }: { member: TeamMember; onNeu: () => void }) {
  const { toast } = useToast()
  const [zeigen, setZeigen] = useState(false)
  const [busy, setBusy] = useState(false)
  const token = member.calendar_token ?? null

  async function kopieren() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(aboUrl(token, 'https'))
      toast('Link kopiert ✓')
    } catch {
      setZeigen(true)
      toast('Konnte nicht kopieren — Link steht jetzt da zum Markieren.')
    }
  }

  async function erneuern() {
    if (!confirm(`Neuen Link für ${member.name} erzeugen?\n\nDas alte Abo hört damit sofort auf zu funktionieren — auf allen Geräten.`)) return
    setBusy(true)
    const { error } = await neuerSchluessel(member.id)
    setBusy(false)
    if (error) { toast('Fehler: ' + error); return }
    setZeigen(false)
    onNeu()
    toast('Neuer Link erzeugt — altes Abo ist tot.')
  }

  if (!token) {
    return (
      <div className="abo-zeile">
        <span className="assignee-avatar" style={{ background: member.color }}>
          {member.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="abo-text">
          <div className="abo-name">{member.name}</div>
          <div className="abo-hinweis">
            Dafür fehlt noch das Skript <strong>0032</strong> in der Datenbank.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="abo-zeile">
      <span className="assignee-avatar" style={{ background: member.color }}>
        {member.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="abo-text">
        <div className="abo-name">{member.name}</div>
        {zeigen ? (
          <input className="abo-url" readOnly value={aboUrl(token, 'https')} onFocus={(e) => e.target.select()} />
        ) : (
          <div className="abo-hinweis">Link verdeckt — er ist ein Passwort.</div>
        )}
      </div>
      <div className="abo-knoepfe">
        <a className="btn btn-sm btn-primary" href={aboUrl(token)}>Abonnieren</a>
        <button className="btn btn-sm" onClick={kopieren}>Kopieren</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setZeigen((z) => !z)}>
          {zeigen ? 'Verbergen' : 'Zeigen'}
        </button>
        <button className="btn btn-sm btn-danger" onClick={erneuern} disabled={busy}>
          Neu
        </button>
      </div>
    </div>
  )
}
