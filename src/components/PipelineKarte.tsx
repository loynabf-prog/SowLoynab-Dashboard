// Pipeline auf einen Blick (Logik: lib/pipeline.ts).
//   kompakt  -> Startseite: eine Leiste mit sechs Stufen, Zahl und wer dran ist
//   voll     -> Produktion: je Stufe die Videos, die Automatik als Schlange
// Aktualisiert sich live, wenn die Automatik weiterkommt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Cpu, Eye, Scissors, CheckCircle2, CalendarCheck, Loader2, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LogoFrame from './LogoFrame'
import {
  PIPELINE, automatikSatz, bauePipeline,
  type PipeAenderung, type PipeAuftrag, type PipeEintrag, type PipeVideo, type Pipeline, type StufeKey,
} from '../lib/pipeline'

const ICON: Record<StufeKey, LucideIcon> = {
  eingang: Inbox, automatik: Cpu, freigabe: Eye, feinschliff: Scissors, fertig: CheckCircle2, eingeplant: CalendarCheck,
}
const FARBE: Record<StufeKey, string> = {
  eingang: 'grau', automatik: 'lila', freigabe: 'glut', feinschliff: 'blau', fertig: 'gruen', eingeplant: 'gruen',
}

async function ladePipeline(): Promise<Pipeline> {
  const kunde = 'clients(name, logo_url, client_type, pausiert_seit)'
  const [v, a, w] = await Promise.all([
    supabase.from('videos').select(`id, title, client_id, status, produktion_stufe, scheduled_date, updated_at, ${kunde}`)
      .is('deleted_at', null).neq('status', 'posted')
      .or('produktion_stufe.not.is.null,status.eq.planned'),
    supabase.from('produktion_auftraege').select(`id, client_id, status, schritt, dateien, drehtag, created_at, ${kunde}`)
      .is('deleted_at', null).in('status', ['wartet', 'laeuft']),
    supabase.from('video_aenderungen').select('id, video_id, status, wunsch, created_at')
      .is('deleted_at', null).in('status', ['offen', 'laeuft']),
  ])
  const ohnePause = <T extends { clients?: any }>(r: T[]) => r.filter((x) => !x.clients?.pausiert_seit)
  return bauePipeline(
    ohnePause((v.data ?? []) as unknown as PipeVideo[]),
    ohnePause((a.error ? [] : a.data ?? []) as unknown as PipeAuftrag[]),
    ((w.error ? [] : w.data ?? []) as PipeAenderung[]),
  )
}

export default function PipelineKarte({ kompakt = false }: { kompakt?: boolean }) {
  const navigate = useNavigate()
  const [p, setP] = useState<Pipeline | null>(null)
  const [offen, setOffen] = useState<StufeKey | null>(null)
  const warte = useRef<number | null>(null)

  const laden = useCallback(async () => {
    try { setP(await ladePipeline()) } catch { /* Tabellen fehlen -> Karte bleibt weg */ }
  }, [])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    // Viele Aenderungen kurz hintereinander (Automatik) -> einmal neu laden
    const neu = () => {
      if (warte.current) window.clearTimeout(warte.current)
      warte.current = window.setTimeout(() => laden(), 800)
    }
    const ch = supabase
      .channel(`pipeline-${kompakt ? 'k' : 'v'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produktion_auftraege' }, neu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, neu)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos' }, neu)
      .subscribe()
    window.addEventListener('daten-geaendert', neu)
    return () => { supabase.removeChannel(ch); window.removeEventListener('daten-geaendert', neu) }
  }, [laden, kompakt])

  // Von der Startseite mit #stufe gekommen: dorthin scrollen, sobald geladen
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (kompakt || !p) return
    const k = window.location.hash.slice(1)
    const ziel = k ? document.getElementById(k) : null
    if (ziel) ziel.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
  }, [kompakt, !!p]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null
  const gesamt = PIPELINE.reduce((s, st) => s + p[st.key].length, 0)
  if (kompakt && gesamt === 0) return null

  const oeffne = (e: PipeEintrag) => {
    if (e.art === 'auftrag') navigate(`/client/${e.clientId}`)
    else navigate(`/client/${e.clientId}?video=${e.id}&open=1`)
  }
  const zurStufe = (k: StufeKey) => {
    if (k === 'freigabe') {
      const ziel = document.getElementById('freigabe')
      if (ziel) { ziel.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    }
    if (kompakt) navigate(`/produktion#${k}`)
    else setOffen(offen === k ? null : k)
  }

  // ------------------------------------------------------------ kompakt
  if (kompakt) {
    return (
      <div className="pl-karte pl-kompakt">
        <button type="button" className="pl-kopf" onClick={() => navigate('/produktion')}>
          <strong>Pipeline</strong>
          <span className="pl-satz">
            {p.automatik.some((e) => e.laeuft) && <i className="pl-puls" />}
            {automatikSatz(p)}
          </span>
          <ChevronRight className="n-chevron" />
        </button>
        <div className="pl-leiste">
          {PIPELINE.map((st) => {
            const n = p[st.key].length
            const Ic = ICON[st.key]
            return (
              <button key={st.key} type="button" className={`pl-stufe ${n ? 'voll' : ''} ${st.key}`} onClick={() => zurStufe(st.key)}>
                <span className={`n-ic ${n ? FARBE[st.key] : 'grau'}`}><Ic strokeWidth={2.2} /></span>
                <b>{n}</b>
                <small>{st.wer}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------- voll
  return (
    <div className="pl-karte" id="pipeline">
      <div className="pl-kopf statisch">
        <strong>Pipeline</strong>
        <span className="pl-satz">
          {p.automatik.some((e) => e.laeuft) && <i className="pl-puls" />}
          {automatikSatz(p)}
        </span>
      </div>
      <div className="pl-spalten">
        {PIPELINE.map((st) => {
          const liste = p[st.key]
          const Ic = ICON[st.key]
          const zeigen = offen === st.key ? liste : liste.slice(0, 6)
          return (
            <section key={st.key} id={st.key} className={`pl-spalte ${st.key}`}>
              <header>
                <span className={`n-ic ${liste.length ? FARBE[st.key] : 'grau'}`}><Ic strokeWidth={2.2} /></span>
                <span className="pl-spalte-titel">
                  <strong>{st.titel}</strong>
                  <small>{st.wer}</small>
                </span>
                <b className="pl-zahl">{liste.length}</b>
              </header>
              {liste.length === 0 ? (
                <p className="pl-leer">{st.leer}</p>
              ) : (
                <ul>
                  {zeigen.map((e) => (
                    <li key={e.key}>
                      <button type="button" className={`pl-eintrag ${e.laeuft ? 'laeuft' : ''}`} onClick={() => oeffne(e)}>
                        {st.key === 'automatik' && (
                          <span className="pl-platz">{e.laeuft ? <Loader2 className="pl-dreht" strokeWidth={2.4} /> : e.platz}</span>
                        )}
                        <LogoFrame name={e.kunde} logoUrl={e.logo} className="pl-logo" />
                        <span className="n-text">
                          <span className="n-titel">{e.titel}</span>
                          <span className="n-unter">{e.kunde} · {e.unter}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {liste.length > 6 && (
                <button type="button" className="n-mehr-link pl-mehr" onClick={() => setOffen(offen === st.key ? null : st.key)}>
                  {offen === st.key ? 'Weniger' : `Alle ${liste.length} zeigen`}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
