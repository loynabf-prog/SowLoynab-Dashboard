// Stempeluhr: in einen Job gehen, wechseln, rausgehen (Zeiterfassung, 0079).
// ---------------------------------------------------------------------------
// Oben im Kopf ein Uhr-Knopf; laeuft ein Job, schwebt unten eine Pille mit
// Rolle und laufender Zeit. Antippen oeffnet das Blatt: alle Jobs als Kacheln,
// Tipp = rein (oder wechseln), unten "Rausgehen" mit "Was ist rausgekommen?".

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Timer, Square, X } from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useJobs, useLaufend, stempelStart, stempelStop, jobIcon, uhr } from '../lib/jobs'
import '../styles/zeiten.css'

export default function Stempeluhr() {
  const { memberId, setMemberId } = useIdentity()
  const { members } = useTeam()
  const jobs = useJobs()
  const { laufend, neuLaden } = useLaufend(memberId)
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState('')
  const [jetzt, setJetzt] = useState(Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!laufend) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [laufend])
  useEffect(() => {
    const auf = () => setOffen(true)
    window.addEventListener('open-stempeluhr', auf)
    return () => window.removeEventListener('open-stempeluhr', auf)
  }, [])

  const job = laufend ? jobs.find((j) => j.slug === laufend.job) : undefined

  async function rein(slug: string) {
    if (!memberId || busy) return
    if (laufend?.job === slug) return
    setBusy(true)
    try {
      if (laufend && ergebnis.trim()) await stempelStop(memberId, ergebnis.trim())
      await stempelStart(memberId, slug)
      setErgebnis(''); neuLaden(); setOffen(false)
    } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }
  async function raus() {
    if (!memberId || busy) return
    setBusy(true)
    try { await stempelStop(memberId, ergebnis.trim() || null); setErgebnis(''); neuLaden(); setOffen(false) }
    catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <button
        className={`n-kopf-knopf stempel-knopf ${laufend ? 'an' : ''}`}
        style={job ? { color: job.farbe } : undefined}
        onClick={() => setOffen(true)}
        aria-label="Zeiterfassung"
        title={job ? `${job.rolle} – läuft` : 'In einen Job gehen'}
      >
        <Timer size={21} strokeWidth={2} />
        {laufend && <i className="stempel-punkt" style={{ background: job?.farbe }} />}
      </button>

      {laufend && job && !offen && createPortal(
        <button className="stempel-pille" onClick={() => setOffen(true)} style={{ ['--job' as string]: job.farbe }}>
          <i className="stempel-puls" />
          <span className="stempel-pille-rolle">{job.rolle}</span>
          <b>{uhr(laufend.start, jetzt)}</b>
        </button>,
        document.body,
      )}

      {offen && createPortal(
        <div className="modal-backdrop" onMouseDown={() => setOffen(false)}>
          <div className="modal stempel-blatt" onMouseDown={(e) => e.stopPropagation()}>
            <div className="stempel-kopf">
              <h2>{laufend && job ? `Du bist ${job.rolle}` : 'In welchen Job gehst du?'}</h2>
              <button className="stempel-zu" onClick={() => setOffen(false)} aria-label="Schließen"><X size={20} /></button>
            </div>

            {!memberId ? (
              <div className="stempel-wer">
                <span className="muted">Wer bist du auf diesem Gerät?</span>
                <div className="stempel-wer-knoepfe">
                  {members.map((m) => (
                    <button key={m.id} className="btn" style={{ borderColor: m.color }} onClick={() => setMemberId(m.id)}>{m.name}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {laufend && job && (
                  <div className="stempel-laeuft" style={{ ['--job' as string]: job.farbe }}>
                    <div className="stempel-laeuft-zeit">{uhr(laufend.start, jetzt)}</div>
                    <div className="muted">{job.name} · seit {new Date(laufend.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Was ist rausgekommen? (z. B. 3 Videos geschnitten)"
                      value={ergebnis}
                      onChange={(e) => setErgebnis(e.target.value)}
                    />
                    <button className="btn stempel-raus" onClick={raus} disabled={busy}><Square size={15} fill="currentColor" />Rausgehen</button>
                  </div>
                )}

                <div className="stempel-raster">
                  {jobs.map((j) => {
                    const I = jobIcon(j.icon)
                    const aktiv = laufend?.job === j.slug
                    return (
                      <button
                        key={j.slug}
                        className={`stempel-kachel ${aktiv ? 'aktiv' : ''}`}
                        style={{ ['--job' as string]: j.farbe }}
                        onClick={() => rein(j.slug)}
                        disabled={busy}
                        title={j.was}
                      >
                        <span className="stempel-icon"><I size={20} strokeWidth={2.1} /></span>
                        <span className="stempel-kachel-rolle">{j.rolle}</span>
                        <span className="stempel-kachel-name">{j.name}</span>
                      </button>
                    )
                  })}
                </div>
                {laufend && <p className="muted stempel-hinweis">Tipp auf einen anderen Job wechselt direkt — die Zeit wird sauber aufgeteilt.</p>}
                <Link to="/zeiten" className="stempel-link" onClick={() => setOffen(false)}>Wo geht unsere Zeit hin? →</Link>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
