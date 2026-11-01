// Kalender -- der gemeinsame Kalender von Fassie, Lion und der Agentur.
// ---------------------------------------------------------------------------
// Fassie (01.11.2026): "Einmal mit Lions Terminen, einmal mit meinen und dann
// nochmal mit unseren, also Terminen fuer die Agentur. Damit wir immer
// wissen, wann wir Zeit haben und wann nicht."
//
// Drei Spuren, aus member_ids abgeleitet (kein neues Feld noetig):
//   genau eine Person   -> deren Spur (privat / eigener Termin)
//   leer oder beide     -> Agentur (betrifft uns beide)
//
// Farbe eines Termins = Kategorie (lib/kalender.ts), Spalte = wessen Termin.
// Oben ein Monat mit farbigen Punkten je Kategorie, darunter die Tage ab dem
// gewaehlten Tag mit drei Spalten nebeneinander. Leere Spalte = "frei".

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import TerminModal from '../components/TerminModal'
import type { CalEventRow } from '../lib/types'
import { heute as heuteIso } from '../lib/datum'
import { KATEGORIEN, farbeVon, kategorieVon } from '../lib/kalender'
import '../styles/kalender.css'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const AGENTUR = 'agentur'
const SPUR_FARBE = '#1d1d1f'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ausIso(s: string): Date { return new Date(s + 'T12:00:00') }
function plus(s: string, n: number): string { const d = ausIso(s); d.setDate(d.getDate() + n); return iso(d) }
function montag(d: Date): Date { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }

export interface Spur { key: string; name: string; farbe: string }

/** Zu welcher Spur gehoert ein Termin? */
export function spurVon(member_ids: string[] | null | undefined, personen: string[]): string {
  const ids = (member_ids ?? []).filter((m) => personen.includes(m))
  return ids.length === 1 ? ids[0] : AGENTUR
}

/** Liegt der Termin an diesem Tag? (mehrtaegige Termine eingeschlossen) */
export function liegtAn(t: Pick<CalEventRow, 'starts_on' | 'ends_on'>, tag: string): boolean {
  return t.starts_on <= tag && (t.ends_on ?? t.starts_on) >= tag
}

export default function Calendar() {
  const { session } = useAuth()
  const { members } = useTeam()
  const heute = heuteIso()
  const [monat, setMonat] = useState(() => heute.slice(0, 7))
  const [tag, setTag] = useState(() => new URLSearchParams(location.search).get('tag') ?? heute)
  const [termine, setTermine] = useState<CalEventRow[]>([])
  const [aus, setAus] = useState<string[]>([])
  const [modal, setModal] = useState<{ termin: CalEventRow | null; datum?: string; wer?: string[]; zeit?: string } | null>(null)

  const spuren: Spur[] = useMemo(() => [
    // Spalten neutral -- Farbe gehoert der Kategorie
    ...members.map((m) => ({ key: m.id, name: (m.name ?? '').split(' ')[0] || 'Person', farbe: SPUR_FARBE })),
    { key: AGENTUR, name: 'Agentur', farbe: SPUR_FARBE },
  ], [members])
  const personen = useMemo(() => members.map((m) => m.id), [members])
  const sichtbar = spuren.filter((s) => !aus.includes(s.key))

  // Laden: Monatsraster (inkl. Raender) bis 14 Tage nach dem gewaehlten Tag
  const rasterStart = iso(montag(ausIso(monat + '-01')))
  const bisTag = [plus(rasterStart, 41), plus(tag, 14)].sort()[1]
  const laden = useCallback(async () => {
    const { data } = await supabase.from('events')
      .select('id, title, kind, kategorie, client_id, clients(name), starts_on, ends_on, starts_at, ends_at, member_ids, notes, deleted_at')
      .is('deleted_at', null)
      .lte('starts_on', bisTag)
      .or(`ends_on.gte.${rasterStart},and(ends_on.is.null,starts_on.gte.${rasterStart})`)
      .order('starts_on').order('starts_at', { nullsFirst: true })
    setTermine((data ?? []) as unknown as CalEventRow[])
  }, [rasterStart, bisTag])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const ch = supabase.channel('kalender-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  const amTag = useCallback((t: string, spur?: string) => termine
    .filter((e) => liegtAn(e, t) && (!spur || spurVon(e.member_ids, personen) === spur))
    .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '')), [termine, personen])

  // Monatsraster
  const zellen = useMemo(() => Array.from({ length: 42 }, (_, i) => plus(rasterStart, i)), [rasterStart])
  const [j, m] = monat.split('-').map(Number)
  function monatWechseln(d: number) {
    const x = new Date(j, m - 1 + d, 1)
    setMonat(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  function waehlen(t: string) { setTag(t); if (t.slice(0, 7) !== monat) setMonat(t.slice(0, 7)) }


  return (
    <div className="kal">
      <div className="kal-kopf">
        <h1>Kalender</h1>
        <button className="kal-neu" onClick={() => setModal({ termin: null, datum: tag })}><Plus strokeWidth={2.6} /> Termin</button>
      </div>

      {/* Wer wird angezeigt */}
      <div className="kal-spuren">
        {spuren.map((s) => {
          const an = !aus.includes(s.key)
          return (
            <button key={s.key} className={`kal-spur ${an ? 'an' : ''}`} style={an ? { background: s.farbe, borderColor: s.farbe } : { borderColor: s.farbe, color: s.farbe }}
              onClick={() => setAus((a) => (a.includes(s.key) ? a.filter((x) => x !== s.key) : [...a, s.key]))}>
              {s.name}
            </button>
          )
        })}
      </div>

      {/* Monat */}
      <section className="kal-monat">
        <div className="kal-monat-kopf">
          <button onClick={() => monatWechseln(-1)} aria-label="Vorheriger Monat"><ChevronLeft /></button>
          <strong>{MONATE[m - 1]} {j}</strong>
          <span className="kal-monat-rechts">
            {tag !== heute && <button className="kal-heute" onClick={() => waehlen(heute)}>Heute</button>}
            <button onClick={() => monatWechseln(1)} aria-label="Nächster Monat"><ChevronRight /></button>
          </span>
        </div>
        <div className="kal-raster">
          {WT.map((w) => <span key={w} className="kal-wt">{w}</span>)}
          {zellen.map((z) => {
            const farben = [...new Set(sichtbar.flatMap((s) => amTag(z, s.key)).map((e) => kategorieVon(e)))]
            const punkte = KATEGORIEN.filter((k) => farben.includes(k.key)).slice(0, 4).map((k) => ({ key: k.key, farbe: k.farbe }))
            return (
              <button key={z} className={`kal-zelle ${z.slice(0, 7) !== monat ? 'fremd' : ''} ${z === heute ? 'heute' : ''} ${z === tag ? 'gewaehlt' : ''}`} onClick={() => waehlen(z)}>
                <span className="kal-nr">{Number(z.slice(8))}</span>
                <span className="kal-punkte">{punkte.map((s) => <i key={s.key} style={{ background: s.farbe }} />)}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Der Tag: Zeitleiste 5-20 Uhr (Fassie, 01.11.2026). Agentur = volle
          Breite, Fassie = linke Haelfte, Lion = rechte Haelfte. */}
      <Tagesplan
        tag={tag} heute={heute} termine={termine.filter((e) => liegtAn(e, tag))} personen={personen} spuren={spuren} sichtbar={sichtbar.map((s) => s.key)}
        onTag={waehlen} onTermin={(e) => setModal({ termin: e })}
        onNeu={(spur, zeit) => setModal({ termin: null, datum: tag, wer: spur === AGENTUR ? [] : [spur], zeit })}
      />
      <div className="kal-legende">{KATEGORIEN.map((k) => <span key={k.key}><i style={{ background: k.farbe }} />{k.name}</span>)}</div>
      <p className="kal-hinweis">Volle Breite = Agentur (beide). Links = nur Fassie, rechts = nur Lion. Tipp auf eine freie Stelle = neuer Termin zu dieser Zeit.</p>

      {modal && (
        <TerminModal
          termin={modal.termin}
          datum={modal.datum}
          werVorgabe={modal.wer}
          zeitVorgabe={modal.zeit}
          userId={session?.user?.id ?? null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); laden() }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------- Tagesplan
const VON = 5, BIS = 20, STUNDE = 60 // px je Stunde

function minuten(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function Tagesplan({ tag, heute, termine, personen, spuren, sichtbar, onTag, onTermin, onNeu }: {
  tag: string; heute: string; termine: CalEventRow[]; personen: string[]; spuren: Spur[]; sichtbar: string[]
  onTag: (t: string) => void; onTermin: (e: CalEventRow) => void; onNeu: (spur: string, zeit: string) => void
}) {
  const [ganz, setGanz] = useState(false)
  const von = ganz ? 0 : VON, bis = ganz ? 24 : BIS
  const d = ausIso(tag)
  const mitZeit = termine.filter((e) => e.starts_at && sichtbar.includes(spurVon(e.member_ids, personen)))
  const ganztags = termine.filter((e) => !e.starts_at && sichtbar.includes(spurVon(e.member_ids, personen)))
  const [ich, er] = personen
  const lage = (e: CalEventRow): { left: string; right: string } => {
    const s = spurVon(e.member_ids, personen)
    if (s === AGENTUR) return { left: '0', right: '0' }
    return s === ich ? { left: '0', right: '50%' } : s === er ? { left: '50%', right: '0' } : { left: '0', right: '0' }
  }
  // Was ausserhalb 5-20 liegt, aber heute dran ist
  const ausserhalb = !ganz && mitZeit.some((e) => (minuten(e.starts_at)! < VON * 60) || ((minuten(e.ends_at) ?? minuten(e.starts_at)! + 60) > BIS * 60))
  const jetzt = tag === heute ? new Date().getHours() * 60 + new Date().getMinutes() : null
  const frei = mitZeit.length === 0 && ganztags.length === 0

  function klick(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.target !== ev.currentTarget) return
    const r = ev.currentTarget.getBoundingClientRect()
    const min = von * 60 + Math.floor(((ev.clientY - r.top) / STUNDE) * 60 / 30) * 30
    const spur = personen.length >= 2 ? ((ev.clientX - r.left) / r.width < 0.5 ? ich : er) : AGENTUR
    onNeu(spur, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
  }

  return (
    <section className="kal-tagplan">
      <div className="kal-tagplan-kopf">
        <button onClick={() => onTag(plus(tag, -1))} aria-label="Vortag"><ChevronLeft /></button>
        <div className="kal-tagplan-titel">
          <strong>{tag === heute ? 'Heute' : tag === plus(heute, 1) ? 'Morgen' : WT[(d.getDay() + 6) % 7]}</strong>
          <span>{d.getDate()}. {MONATE[d.getMonth()]}{frei ? ' · frei' : ''}</span>
        </div>
        <button onClick={() => onTag(plus(tag, 1))} aria-label="Folgetag"><ChevronRight /></button>
      </div>
      {ganztags.length > 0 && (
        <div className="kal-ganztags">
          {ganztags.map((e) => <button key={e.id} style={{ ['--f' as string]: farbeVon(e) }} onClick={() => onTermin(e)}>{e.title}</button>)}
        </div>
      )}
      <div className="kal-spalten-kopf">
        {personen.length >= 2 ? <><span>{spuren.find((s) => s.key === ich)?.name}</span><span>{spuren.find((s) => s.key === er)?.name}</span></> : <span>Agentur</span>}
      </div>
      <div className="kal-zeit">
        <div className="kal-stunden">
          {Array.from({ length: bis - von + 1 }, (_, i) => <span key={i} style={{ top: i * STUNDE }}>{String(von + i).padStart(2, '0')}</span>)}
        </div>
        <div className="kal-raster-zeit" style={{ height: (bis - von) * STUNDE }} onClick={klick}>
          {Array.from({ length: bis - von }, (_, i) => <i key={i} className="kal-linie" style={{ top: i * STUNDE }} />)}
          <i className="kal-mitte" />
          {jetzt != null && jetzt >= von * 60 && jetzt <= bis * 60 && <i className="kal-jetzt" style={{ top: ((jetzt - von * 60) / 60) * STUNDE }} />}
          {mitZeit.map((e) => {
            const a = Math.max(von * 60, minuten(e.starts_at)!)
            const z = Math.min(bis * 60, minuten(e.ends_at) ?? minuten(e.starts_at)! + 60)
            if (z <= a) return null
            const top = ((a - von * 60) / 60) * STUNDE, hoehe = Math.max(22, ((z - a) / 60) * STUNDE - 2)
            return (
              <button key={e.id} className={`kal-block ${hoehe < 40 ? 'klein' : ''}`} style={{ top, height: hoehe, ...lage(e), ['--f' as string]: farbeVon(e) }} onClick={(ev) => { ev.stopPropagation(); onTermin(e) }}>
                <strong>{e.title}</strong>
                <small>{e.starts_at!.slice(0, 5)}{e.ends_at ? `–${e.ends_at.slice(0, 5)}` : ''}{e.clients?.name ? ` · ${e.clients.name}` : ''}</small>
              </button>
            )
          })}
        </div>
      </div>
      <button className="kal-ganz" onClick={() => setGanz((g) => !g)}>{ganz ? 'Nur 5–20 Uhr' : ausserhalb ? 'Ganzer Tag (es gibt Termine außerhalb 5–20 Uhr)' : 'Ganzer Tag anzeigen'}</button>
    </section>
  )
}
