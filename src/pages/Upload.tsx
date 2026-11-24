// Upload-Kalender (Fassie, 24.11.2026): getrennt vom Termin-Kalender.
// Ein Monat auf einen Blick -- jeder Tag gruen, wenn alles, was an dem Tag
// rausgehen soll, gepostet oder bei Metricool eingeplant ist, sonst rot.
// Ziel: der naechste Monat ist komplett gruen, bevor er anfaengt.
//
// Quelle: videos (Posting-Tag) + uploads (Spiegel von Metricool, den Claude
// abgleicht -- system_status 'metricool-sync'). Kunden ohne Vertrag
// (Referenz/Ehrenamt) werden hoechstens gelb, nie rot.
// Nur Anzeige, keine Knoepfe.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { heute } from '../lib/datum'
import { monatPlus, monatName } from '../lib/monate'
import '../styles/upload.css'

interface Video { id: string; title: string | null; scheduled_date: string; scheduled_time: string | null; status: string; prep_scheduled: boolean | null; client_id: string }
interface Upload { metricool_id: string; client_id: string; video_id: string | null; datum: string; uhrzeit: string | null; plattformen: string[]; status: string; hat_caption: boolean; titel: string | null }
interface Kunde { id: string; name: string; client_type: string | null; brand_color: string | null; metricool_brand_id: string | null }

interface Eintrag {
  key: string; kunde: Kunde; titel: string; uhrzeit: string | null
  zustand: 'gepostet' | 'eingeplant' | 'offen'
  plattformen: string[]; caption: boolean; metricool: boolean
}
type Farbe = 'gruen' | 'gelb' | 'rot' | 'leer'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PLATTFORM: Record<string, string> = { instagram: 'IG', tiktok: 'TT', facebook: 'FB', youtube: 'YT' }

function wochenVon(key: string): string[][] {
  const [j, m] = key.split('-').map(Number)
  const erster = new Date(j, m - 1, 1)
  const start = new Date(erster); start.setDate(1 - ((erster.getDay() + 6) % 7))
  const wochen: string[][] = []
  const d = new Date(start)
  do {
    const w: string[] = []
    for (let i = 0; i < 7; i++) { w.push(iso(d)); d.setDate(d.getDate() + 1) }
    wochen.push(w)
  } while (d.getMonth() === m - 1)
  return wochen
}

export default function Upload() {
  const heuteIso = heute()
  const [monat, setMonat] = useState(heuteIso.slice(0, 7))
  const [videos, setVideos] = useState<Video[]>([])
  const [uploads, setUploads] = useState<Upload[]>([])
  const [kunden, setKunden] = useState<Map<string, Kunde>>(new Map())
  const [stand, setStand] = useState<string | null>(null)
  const [wahl, setWahl] = useState<string | null>(null)
  const wochen = useMemo(() => wochenVon(monat), [monat])
  const von = wochen[0][0], bis = wochen[wochen.length - 1][6]

  const laden = useCallback(async () => {
    const [v, u, k, s] = await Promise.all([
      supabase.from('videos').select('id, title, scheduled_date, scheduled_time, status, prep_scheduled, client_id')
        .is('deleted_at', null).gte('scheduled_date', von).lte('scheduled_date', bis),
      supabase.from('uploads').select('metricool_id, client_id, video_id, datum, uhrzeit, plattformen, status, hat_caption, titel')
        .is('deleted_at', null).gte('datum', von).lte('datum', bis),
      supabase.from('clients').select('id, name, client_type, brand_color, metricool_brand_id').is('deleted_at', null),
      supabase.from('system_status').select('last_ok').eq('job', 'metricool-sync').maybeSingle(),
    ])
    setVideos((v.data ?? []) as Video[])
    setUploads((u.data ?? []) as Upload[])
    setKunden(new Map(((k.data ?? []) as Kunde[]).map((x) => [x.id, x])))
    setStand((s.data as { last_ok: string | null } | null)?.last_ok ?? null)
  }, [von, bis])

  useEffect(() => {
    laden()
    const ch = supabase.channel('upload-kalender')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => laden())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uploads' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  // Je Tag alle Eintraege: CRM-Videos (mit Metricool-Daten, wenn verbunden) + Metricool-Posts ohne CRM-Video
  const proTag = useMemo(() => {
    const m = new Map<string, Eintrag[]>()
    const uVonVideo = new Map(uploads.filter((u) => u.video_id).map((u) => [u.video_id!, u]))
    const add = (tag: string, e: Eintrag) => { const l = m.get(tag) ?? []; l.push(e); m.set(tag, l) }
    for (const v of videos) {
      const k = kunden.get(v.client_id); if (!k) continue
      const u = uVonVideo.get(v.id)
      add(v.scheduled_date, {
        key: v.id, kunde: k, titel: v.title || 'Video', uhrzeit: u?.uhrzeit ?? v.scheduled_time,
        zustand: v.status === 'posted' || u?.status === 'veroeffentlicht' ? 'gepostet' : u || v.prep_scheduled ? 'eingeplant' : 'offen',
        plattformen: u?.plattformen ?? [], caption: u?.hat_caption ?? false, metricool: !!u,
      })
    }
    for (const u of uploads) {
      if (u.video_id) continue
      const k = kunden.get(u.client_id); if (!k) continue
      add(u.datum, {
        key: u.metricool_id, kunde: k, titel: u.titel || 'Post', uhrzeit: u.uhrzeit,
        zustand: u.status === 'veroeffentlicht' ? 'gepostet' : 'eingeplant',
        plattformen: u.plattformen, caption: u.hat_caption, metricool: true,
      })
    }
    for (const l of m.values()) l.sort((a, b) => (a.uhrzeit ?? '99').localeCompare(b.uhrzeit ?? '99'))
    return m
  }, [videos, uploads, kunden])

  const farbe = useCallback((tag: string): Farbe => {
    const l = proTag.get(tag) ?? []
    if (!l.length) return 'leer'
    const offen = l.filter((e) => e.zustand === 'offen')
    if (!offen.length) return 'gruen'
    return offen.some((e) => e.kunde.client_type === 'zahlend') ? 'rot' : 'gelb'
  }, [proTag])

  const tageImMonat = wochen.flat().filter((t) => t.startsWith(monat))
  const mitPosts = tageImMonat.filter((t) => farbe(t) !== 'leer')
  const gruen = mitPosts.filter((t) => farbe(t) === 'gruen').length
  const gewaehlt = wahl && wahl.startsWith(monat) ? wahl : null
  const liste = gewaehlt ? proTag.get(gewaehlt) ?? [] : []

  return (
    <div className="up">
      <div className="up-kopf">
        <button className="up-pfeil" onClick={() => { setMonat(monatPlus(monat, -1)); setWahl(null) }} aria-label="Vorheriger Monat"><ChevronLeft /></button>
        <div className="up-titel">
          <strong>{monatName(monat)}</strong>
          <span>{mitPosts.length ? `${gruen} von ${mitPosts.length} Tagen grün` : 'Noch nichts geplant'}</span>
        </div>
        <button className="up-pfeil" onClick={() => { setMonat(monatPlus(monat, 1)); setWahl(null) }} aria-label="Nächster Monat"><ChevronRight /></button>
      </div>
      {mitPosts.length > 0 && <div className="up-fortschritt"><i style={{ width: `${Math.round((gruen / mitPosts.length) * 100)}%` }} /></div>}

      <div className="up-kal">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <span key={w} className="up-wt">{w}</span>)}
        {wochen.flat().map((tag) => {
          const l = proTag.get(tag) ?? []
          const f = farbe(tag)
          const aussen = !tag.startsWith(monat)
          return (
            <button key={tag} onClick={() => setWahl(tag)}
              className={`up-tag ${f} ${aussen ? 'aussen' : ''} ${tag === heuteIso ? 'heute' : ''} ${tag === gewaehlt ? 'gewaehlt' : ''} ${tag < heuteIso ? 'vorbei' : ''}`}>
              <span className="up-zahl">{Number(tag.slice(8))}</span>
              <span className="up-punkte">
                {l.slice(0, 4).map((e) => <i key={e.key} className={e.zustand} style={{ background: e.zustand === 'offen' ? undefined : e.kunde.brand_color ?? undefined }} title={e.kunde.name} />)}
                {l.length > 4 && <em>+{l.length - 4}</em>}
              </span>
            </button>
          )
        })}
      </div>

      {gewaehlt && (
        <section className="up-liste">
          <h3>{new Date(gewaehlt + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {liste.length === 0 && <p className="up-leer">Nichts geplant.</p>}
          {liste.map((e) => (
            <div key={e.key} className={`up-zeile ${e.zustand}`}>
              <span className="up-strich" style={{ background: e.kunde.brand_color ?? undefined }} />
              <span className="up-text">
                <strong>{e.titel}</strong>
                <small>{e.uhrzeit ? `${e.uhrzeit.slice(0, 5)} · ` : ''}{e.kunde.name}</small>
              </span>
              <span className="up-merkmale">
                {e.plattformen.map((p) => <b key={p}>{PLATTFORM[p] ?? p}</b>)}
                {e.metricool && <b className={e.caption ? 'ok' : 'fehlt'}>{e.caption ? 'Caption' : 'ohne Caption'}</b>}
              </span>
              <span className={`up-status ${e.zustand}`}>
                {e.zustand === 'gepostet' ? <><Check /> gepostet</> : e.zustand === 'eingeplant' ? <><Check /> eingeplant</> : <><X /> offen</>}
              </span>
            </div>
          ))}
        </section>
      )}

      <p className="up-fuss">
        Grün = alles gepostet oder bei Metricool eingeplant · Rot = etwas fehlt noch · Gelb = nur bei Kunden ohne Vertrag
        {stand && <> · Metricool-Stand {new Date(stand).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr</>}
      </p>
    </div>
  )
}
