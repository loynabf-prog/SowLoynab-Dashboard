import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'

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
      toast('Mitglied hinzugefügt ✓')
    }
  }

  async function rename(id: string, current: string) {
    const n = prompt('Neuer Name:', current)
    if (n == null || !n.trim()) return
    await supabase.from('team_members').update({ name: n.trim() }).eq('id', id)
    reload()
    toast('Umbenannt ✓')
  }

  async function recolor(id: string, c: string) {
    await supabase.from('team_members').update({ color: c }).eq('id', id)
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
              ✕
            </button>
          </div>
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
