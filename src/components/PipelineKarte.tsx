// Pipeline auf einen Blick (Logik: lib/pipeline.ts).
//   kompakt  -> Startseite: eine Leiste mit sechs Stufen, Zahl und wer dran ist
//   voll     -> Produktion: je Stufe die Videos, die Automatik als Schlange
// Aktualisiert sich live, wenn die Automatik weiterkommt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Wand2, Eye, Scissors, CheckCircle2, CalendarCheck, Loader2, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import LogoFrame from './LogoFrame'
import { BildStapel } from './AppIcon'
import {
  PIPELINE, bauePipeline,
  type PipeAenderung, type PipeAuftrag, type PipeEintrag, type PipeVideo, type Pipeline, type StufeKey,
} from '../lib/pipeline'

const ICON: Record<StufeKey, LucideIcon> = {
  eingang: Inbox, automatik: Wand2, freigabe: Eye, feinschliff: Scissors, fertig: CheckCircle2, eingeplant: CalendarCheck,
}
const FARBE: Record<StufeKey, string> = {
  eingang: 'grau', automatik: 'lila', freigabe: 'glut', feinschliff: 'blau', fertig: 'tuerkis', eingeplant: 'gruen',
}

/** Echte Gesichter fuer die Stationen "Fassie" und "Lion": Profilbild ihres privaten Accounts. */
async function ladeGesichter(): Promise<Partial<Record<StufeKey, string>>> {
  const { data } = await supabase.from('client_accounts')
    .select('profilbild_url, platform, client_channels(name), clients!inner(client_type)')
    .eq('clients.client_type', 'eigen').not('profilbild_url', 'is', null)
  const out: Partial<Record<StufeKey, string>> = {}
  const rows = ((data ?? []) as any[]).sort((a, b) => (a.platform === 'instagram' ? -1 : 1) - (b.platform === 'instagram' ? -1 : 1))
  for (const r of rows) {
    const n = String(r.client_channels?.name ?? '').toLowerCase()
    if (n.startsWith('fassie') && !out.freigabe) out.freigabe = r.profilbild_url
    if (n.startsWith('lion') && !out.feinschliff) out.feinschliff = r.profilbild_url
  }
  return out
}

async function ladePipeline(personVon: (id: string | null) => 'fassie' | 'lion' | null): Promise<Pipeline> {
  const kunde = 'clients(name, logo_url, client_type, pausiert_seit, zustaendig_id)'
  const [v, a, w] = await Promise.all([
    supabase.from('videos').select(`id, title, client_id, status, produktion_stufe, scheduled_date, updated_at, bearbeiter_id, ${kunde}`)
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
    personVon,
  )
}

export default function PipelineKarte({ kompakt = false }: { kompakt?: boolean }) {
  const navigate = useNavigate()
  const [p, setP] = useState<Pipeline | null>(null)
  const [gesichter, setGesichter] = useState<Partial<Record<StufeKey, string>>>({})
  useEffect(() => { ladeGesichter().then(setGesichter).catch(() => {}) }, [])
  const [offen, setOffen] = useState<StufeKey | null>(null)
  const warte = useRef<number | null>(null)

  const { members } = useTeam()
  const personVon = useCallback((id: string | null) => {
    const n = members.find((m) => m.id === id)?.name ?? ''
    return /^lion/i.test(n) ? 'lion' as const : /^fassie/i.test(n) ? 'fassie' as const : null
  }, [members])
  const laden = useCallback(async () => {
    try { setP(await ladePipeline(personVon)) } catch { /* Tabellen fehlen -> Karte bleibt weg */ }
  }, [personVon])

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
    if (kompakt) navigate(k === 'automatik' || k === 'eingang' ? '/produktion#ofen' : `/produktion#${k}`)
    else setOffen(offen === k ? null : k)
  }

  // ------------------------------------------------------------ kompakt
  const laeuft = p.automatik.some((e) => e.laeuft)
  if (kompakt) {
    return (
      <div className="linie-karte">
        <button type="button" className="linie-kopf" onClick={() => navigate('/produktion')}>
          <strong>Produktion</strong>
          <ChevronRight className="n-chevron" />
        </button>
        <div className="linie">
          <span className="linie-spur">{laeuft && <i />}</span>
          {PIPELINE.map((st) => {
            const n = p[st.key].length
            const klasse = !n ? '' : st.key === 'freigabe' ? 'dran' : st.key === 'automatik' && laeuft ? 'laeuft' : 'voll'
            const gesicht = gesichter[st.key]
            // Kundenlogos der Videos in dieser Station, jeder Kunde einmal
            const logos = [...new Map(p[st.key].map((e) => [e.clientId, { url: e.logo, name: e.kunde }])).values()]
            return (
              <button key={st.key} type="button" className={`station ${klasse} ${gesicht ? 'mitbild' : ''}`} onClick={() => zurStufe(st.key)} aria-label={`${st.kurz}: ${n}`}>
                {gesicht && n > 0 && <span className="station-zahl">{n}</span>}
                <span className="station-punkt">{gesicht ? <img src={gesicht} alt={st.kurz} /> : n}</span>
                <span className="station-name">{st.kurz}</span>
                {logos.length > 0 ? <BildStapel bilder={logos} max={2} /> : <span className="bild-stapel" />}
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
        {laeuft && <i className="pl-puls" />}
      </div>
      <div className="pl-spalten">
        {PIPELINE.map((st) => {
          const liste = p[st.key]
          const Ic = ICON[st.key]
          const zeigen = offen === st.key ? liste : liste.slice(0, 6)
          return (
            <section key={st.key} id={st.key} className={`pl-spalte ${st.key}`}>
              <header>
                <span className={`app-ic klein ${liste.length ? FARBE[st.key] : 'grau'}`}><Ic strokeWidth={2.2} /></span>
                <span className="pl-spalte-titel"><strong>{st.kurz}</strong></span>
                <b className="pl-zahl">{liste.length}</b>
              </header>
              {liste.length === 0 ? (
                <p className="pl-leer">–</p>
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
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {liste.length > 6 && (
                <button type="button" className="n-mehr-link pl-mehr" onClick={() => setOffen(offen === st.key ? null : st.key)}>
                  {offen === st.key ? '–' : `+${liste.length - 6}`}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
