import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import KalenderAbo from '../components/KalenderAbo'
import { useToast } from '../context/ToastContext'
import { BEREICHE } from '../lib/bereiche'
import type { TeamMember } from '../lib/types'

const COLORS = ['#e0521a', '#2563eb', '#2f9e44', '#c98a00', '#7c3aed', '#db2777', '#0891b2', '#65a30d']

export default function Team() {
  const { members, reload } = useTeam()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('team_members').insert({ name: name.trim(), color })
    setBusy(false)
    if (!error) {
      setName('')
      setColor(COLORS[(members.length + 1) % COLORS.length])
      reload()
      toast('Mitglied hinzugefügt')
    }
  }

  async function rename(id: string, current: string) {
    const n = prompt('Neuer Name:', current)
    if (n == null || !n.trim()) return
    await supabase.from('team_members').update({ name: n.trim() }).eq('id', id)
    reload()
    toast('Umbenannt')
  }

  async function recolor(id: string, c: string) {
    await supabase.from('team_members').update({ color: c }).eq('id', id)
    reload()
  }

  /** Bereich an/aus. Alle an = leer speichern, das heisst "sieht alles". */
  async function toggleBereich(m: TeamMember, key: string) {
    const jetzt = m.bereiche && m.bereiche.length ? m.bereiche : BEREICHE.map((b) => b.key)
    const neu = jetzt.includes(key) ? jetzt.filter((k) => k !== key) : [...jetzt, key]
    const wert = neu.length === BEREICHE.length ? null : neu
    const { error } = await supabase.from('team_members').update({ bereiche: wert }).eq('id', m.id)
    if (error) { toast('Dafür fehlt noch Migration 0037 in der Datenbank.'); return }
    reload()
  }

  async function remove(id: string, n: string) {
    if (!confirm(`"${n}" aus dem Team entfernen? Zuweisungen bleiben erhalten, zeigen aber niemanden mehr an.`)) return
    await supabase.from('team_members').delete().eq('id', id)
    reload()
    toast('Entfernt')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <span className="sub">Wer kann Aufgaben, Leads &amp; Videos zugewiesen bekommen</span>
        </div>
      </div>

      <div className="card-list" style={{ maxWidth: 560 }}>
        {members.map((m) => (
          <div className="team-row" key={m.id}>
            <span className="assignee-avatar" style={{ background: m.color }}>
              {m.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="team-name">{m.name}</span>
            <div className="team-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${m.color === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => recolor(m.id, c)}
                  title="Farbe"
                />
              ))}
            </div>
            <button className="btn btn-sm" onClick={() => rename(m.id, m.name)}>
              Umbenennen
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => remove(m.id, m.name)}>
              
            </button>
          </div>
        ))}
      </div>

      {/* Welche Bereiche sieht wer in der Navigation? Fuer spaetere
          Mitarbeiter: wer nur Analyse macht, sieht auch nur die Analyse. */}
      <h2 className="section-title" style={{ marginTop: 26 }}>Bereiche</h2>
      <p className="muted" style={{ fontSize: 13, maxWidth: 560, marginTop: -4 }}>
        Wer welche Bereiche in der Navigation sieht. Alles an heißt: sieht alles.
        Verwaltung bleibt immer erreichbar.
      </p>
      <div className="card-list" style={{ maxWidth: 560, marginTop: 12 }}>
        {members.map((m) => {
          const an = m.bereiche && m.bereiche.length ? m.bereiche : BEREICHE.map((b) => b.key)
          return (
            <div className="bereich-row" key={m.id}>
              <span className="team-name">{m.name}</span>
              <div className="bereich-chips">
                {BEREICHE.filter((b) => b.key !== 'verwaltung').map((b) => (
                  <button
                    key={b.key}
                    className={`ps-schritt ${an.includes(b.key) ? 'on' : ''}`}
                    aria-pressed={an.includes(b.key)}
                    title={b.zweck}
                    onClick={() => toggleBereich(m, b.key)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Jeder bekommt seinen eigenen Abo-Link: gemeinsame Termine plus die
          eigenen, nicht die privaten des anderen. */}
      <h2 className="section-title" style={{ marginTop: 26 }}>Kalender aufs Handy</h2>
      <p className="muted" style={{ fontSize: 13, maxWidth: 560, marginTop: -4 }}>
        Posting-Tage, Aufgaben und Termine im normalen Handy-Kalender — und damit
        auch im Kalender-Widget auf dem Homescreen. Jeder abonniert nur seinen
        eigenen Link.
      </p>
      <div className="card-list" style={{ maxWidth: 560, marginTop: 12 }}>
        {members.map((m) => (
          <KalenderAbo key={m.id} member={m} onNeu={reload} />
        ))}
      </div>

      <form className="team-add" onSubmit={add} style={{ maxWidth: 560, marginTop: 18 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Neues Mitglied (Name)" />
        <div className="team-colors">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          + Hinzufügen
        </button>
      </form>
    </>
  )
}
