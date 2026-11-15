// Zeiterfassung: wo geht unsere Zeit hin -- je Job, mit Output (0079).
// ---------------------------------------------------------------------------
// Fassie (15.11.2026): "Damit wir sehen, wo wir die meiste Zeit reinstecken,
// fuer welchen Output." Oben Zeitraum und Person, dann ein Balken mit den
// Anteilen, je Job Stunden + was automatisch rauskam (gepostete Videos,
// Rechnungen, Leads ...) und die notierten Ergebnisse. Unten die letzten
// Eintraege und "Nachtragen", falls man vergessen hat zu stempeln.
// Bewusst kein Vergleich Fassie gegen Lion -- Standard ist die Agentur.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Timer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useJobs, jobIcon, dauer, sessionMinuten, berlinTag, type Auswertung, type Session } from '../lib/jobs'
import '../styles/zeiten.css'

type Zeitraum = 'woche' | 'monat' | 'quartal'

function vonBis(z: Zeitraum): [string, string] {
  const heute = berlinTag()
  const d = new Date(heute + 'T12:00:00')
  if (z === 'woche') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  else if (z === 'monat') d.setDate(1)
  else d.setDate(d.getDate() - 89)
  return [d.toISOString().slice(0, 10), heute]
}

export default function Zeiten() {
  const { members, byId } = useTeam()
  const jobs = useJobs()
  const [zeitraum, setZeitraum] = useState<Zeitraum>('woche')
  const [person, setPerson] = useState<string | null>(null)
  const [daten, setDaten] = useState<Auswertung[]>([])
  const [eintraege, setEintraege] = useState<Session[]>([])
  const [offenJob, setOffenJob] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  const [n, setN] = useState(0)
  const [von, bis] = vonBis(zeitraum)

  useEffect(() => {
    supabase.rpc('zeit_auswertung', { von, bis, person }).then(({ data }) => setDaten((data ?? []) as Auswertung[]))
    let q = supabase.from('zeit_sessions').select('*').gte('start', von + 'T00:00:00').order('start', { ascending: false }).limit(60)
    if (person) q = q.eq('member_id', person)
    q.then(({ data }) => setEintraege((data ?? []) as Session[]))
  }, [von, bis, person, n])

  useEffect(() => {
    const ch = supabase.channel(`zeiten-seite-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zeit_sessions' }, () => setN((x) => x + 1))
      .subscribe()
    const t = setInterval(() => setN((x) => x + 1), 60_000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [])

  const gesamt = daten.reduce((s, d) => s + Number(d.minuten), 0)
  const mitZeit = daten.filter((d) => Number(d.minuten) > 0)
  const laufend = eintraege.filter((e) => !e.ende)
  const jobVon = useMemo(() => new Map(jobs.map((j) => [j.slug, j])), [jobs])

  async function loeschen(id: string) {
    if (!confirm('Eintrag löschen?')) return
    await supabase.from('zeit_sessions').delete().eq('id', id)
    setN((x) => x + 1)
  }

  return (
    <div className="zeiten">
      <div className="page-head">
        <div>
          <h1>Zeiterfassung</h1>
          <span className="sub">Wo unsere Zeit hingeht – je Job, mit dem, was dabei rauskommt</span>
        </div>
        <button className="btn btn-primary" onClick={() => window.dispatchEvent(new Event('open-stempeluhr'))}>
          <Timer size={16} />Job wählen
        </button>
      </div>

      <div className="zeiten-filter">
        <div className="seg">
          {(['woche', 'monat', 'quartal'] as Zeitraum[]).map((z) => (
            <button key={z} className={`seg-btn ${zeitraum === z ? 'on' : ''}`} onClick={() => setZeitraum(z)}>
              {z === 'woche' ? 'Diese Woche' : z === 'monat' ? 'Dieser Monat' : '90 Tage'}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={`seg-btn ${!person ? 'on' : ''}`} onClick={() => setPerson(null)}>Agentur</button>
          {members.map((m) => (
            <button key={m.id} className={`seg-btn ${person === m.id ? 'on' : ''}`} onClick={() => setPerson(m.id)}>{m.name}</button>
          ))}
        </div>
      </div>

      {laufend.length > 0 && (
        <div className="zeiten-jetzt">
          {laufend.map((s) => {
            const j = jobVon.get(s.job)
            return (
              <span key={s.id} className="zeiten-jetzt-chip" style={{ ['--job' as string]: j?.farbe }}>
                <i className="stempel-puls" />{byId(s.member_id)?.name} ist gerade <b>{j?.rolle}</b> · {dauer(sessionMinuten(s))}
              </span>
            )
          })}
        </div>
      )}

      <div className="zeiten-summe">
        <div><b>{dauer(gesamt)}</b><span>erfasst</span></div>
        <div><b>{mitZeit.length}</b><span>Jobs mit Zeit</span></div>
        <div><b>{mitZeit[0] ? `${Math.round((Number(mitZeit[0].minuten) / Math.max(gesamt, 1)) * 100)} %` : '–'}</b><span>{mitZeit[0] ? mitZeit[0].name : 'noch nichts'}</span></div>
      </div>

      {gesamt > 0 && (
        <div className="zeiten-balken" aria-label="Anteile je Job">
          {mitZeit.map((d) => (
            <span key={d.job} style={{ width: `${(Number(d.minuten) / gesamt) * 100}%`, background: d.farbe }} title={`${d.name}: ${dauer(Number(d.minuten))}`} />
          ))}
        </div>
      )}

      {gesamt === 0 && (
        <div className="zeiten-leer">
          <Timer size={28} />
          <p>Noch keine Zeit in diesem Zeitraum. Oben auf die Uhr tippen, Job wählen – sie läuft, bis du rausgehst oder wechselst.</p>
        </div>
      )}

      <div className="zeiten-liste">
        {daten.map((d) => {
          const I = jobIcon(d.icon)
          const min = Number(d.minuten)
          const proOutput = d.output_anzahl && min > 0 ? min / d.output_anzahl : null
          const auf = offenJob === d.job
          return (
            <div key={d.job} className={`zeiten-job ${min === 0 ? 'leer' : ''}`} style={{ ['--job' as string]: d.farbe }}>
              <button className="zeiten-job-zeile" onClick={() => setOffenJob(auf ? null : d.job)}>
                <span className="stempel-icon"><I size={18} strokeWidth={2.1} /></span>
                <span className="zeiten-job-text">
                  <b>{d.name}</b>
                  <small>{d.rolle}{d.sessions ? ` · ${d.sessions}× drin` : ''}</small>
                </span>
                <span className="zeiten-job-zahl">
                  <b>{min > 0 ? dauer(min) : '–'}</b>
                  {gesamt > 0 && min > 0 && <small>{Math.round((min / gesamt) * 100)} %</small>}
                </span>
              </button>
              {(d.output_label || d.ergebnisse.length > 0) && (
                <div className="zeiten-output">
                  {d.output_label && (
                    <span>
                      {d.output_anzahl ?? 0} {d.output_label}
                      {proOutput != null && <em> · {dauer(proOutput)} je Stück</em>}
                    </span>
                  )}
                  {d.ergebnisse.length > 0 && !auf && <span className="muted"> · {d.ergebnisse.length} Ergebnis{d.ergebnisse.length > 1 ? 'se' : ''}</span>}
                </div>
              )}
              {auf && d.ergebnisse.length > 0 && (
                <ul className="zeiten-ergebnisse">{d.ergebnisse.map((e, i) => <li key={i}>{e}</li>)}</ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="zeiten-unterkopf">
        <h2 className="section-title">Letzte Einträge</h2>
        <button className="btn btn-sm" onClick={() => setNeu(true)}><Plus size={14} />Nachtragen</button>
      </div>
      {neu && <Nachtragen onFertig={() => { setNeu(false); setN((x) => x + 1) }} />}
      <div className="zeiten-eintraege">
        {eintraege.length === 0 && <p className="muted">Noch nichts erfasst.</p>}
        {eintraege.map((s) => {
          const j = jobVon.get(s.job)
          const tag = new Date(s.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
          const ab = new Date(s.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          const bis_ = s.ende ? new Date(s.ende).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'läuft'
          return (
            <div key={s.id} className="zeiten-eintrag" style={{ ['--job' as string]: j?.farbe }}>
              <i className="zeiten-farbe" />
              <div className="zeiten-eintrag-text">
                <b>{j?.rolle ?? s.job}</b> <span className="muted">· {byId(s.member_id)?.name} · {tag} {ab}–{bis_}{s.quelle === 'chat' ? ' · über Claude' : s.quelle === 'nachgetragen' ? ' · nachgetragen' : ''}</span>
                {s.ergebnis && <div className="zeiten-eintrag-erg">{s.ergebnis}</div>}
              </div>
              <span className="zeiten-eintrag-dauer">{dauer(sessionMinuten(s))}</span>
              <button className="zeiten-weg" onClick={() => loeschen(s.id)} aria-label="Löschen"><Trash2 size={15} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Nachtragen({ onFertig }: { onFertig: () => void }) {
  const { members } = useTeam()
  const jobs = useJobs()
  const [member, setMember] = useState(members[0]?.id ?? '')
  const [job, setJob] = useState('schnitt')
  const [tag, setTag] = useState(berlinTag())
  const [ab, setAb] = useState('09:00')
  const [bis, setBis] = useState('10:00')
  const [erg, setErg] = useState('')
  const [fehler, setFehler] = useState('')

  async function speichern() {
    const start = new Date(`${tag}T${ab}:00`)
    const ende = new Date(`${tag}T${bis}:00`)
    if (!(ende > start)) { setFehler('„Bis“ muss nach „Von“ liegen.'); return }
    const { error } = await supabase.from('zeit_sessions').insert({
      member_id: member, job, start: start.toISOString(), ende: ende.toISOString(), ergebnis: erg.trim() || null, quelle: 'nachgetragen',
    })
    if (error) setFehler(error.message)
    else onFertig()
  }

  return (
    <div className="zeiten-nachtragen">
      <select className="input" value={member} onChange={(e) => setMember(e.target.value)}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <select className="input" value={job} onChange={(e) => setJob(e.target.value)}>
        {jobs.map((j) => <option key={j.slug} value={j.slug}>{j.rolle} – {j.name}</option>)}
      </select>
      <div className="zeiten-nachtragen-zeit">
        <input className="input" type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
        <input className="input" type="time" value={ab} onChange={(e) => setAb(e.target.value)} />
        <input className="input" type="time" value={bis} onChange={(e) => setBis(e.target.value)} />
      </div>
      <input className="input" placeholder="Was ist rausgekommen? (optional)" value={erg} onChange={(e) => setErg(e.target.value)} />
      {fehler && <p className="zeiten-fehler">{fehler}</p>}
      <div className="zeiten-nachtragen-knoepfe">
        <button className="btn" onClick={onFertig}>Abbrechen</button>
        <button className="btn btn-primary" onClick={speichern}>Speichern</button>
      </div>
    </div>
  )
}
