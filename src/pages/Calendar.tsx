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
// Oben ein Monat mit farbigen Punkten je Spur, darunter die Tage ab dem
// gewaehlten Tag mit drei Spalten nebeneinander. Leere Spalte = "frei".

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import TerminModal from '../components/TerminModal'
import type { CalEventRow } from '../lib/types'
import { heute as heuteIso } from '../lib/datum'
import '../styles/kalender.css'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const AGENTUR = 'agentur'
const AGENTUR_FARBE = '#ff6a1f'

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
  const [tag, setTag] = useState(heute)
  const [termine, setTermine] = useState<CalEventRow[]>([])
  const [aus, setAus] = useState<string[]>([])
  const [modal, setModal] = useState<{ termin: CalEventRow | null; datum?: string; wer?: string[] } | null>(null)

  const spuren: Spur[] = useMemo(() => [
    ...members.map((m) => ({ key: m.id, name: (m.name ?? '').split(' ')[0] || 'Person', farbe: m.color || '#8e8e93' })),
    { key: AGENTUR, name: 'Agentur', farbe: AGENTUR_FARBE },
  ], [members])
  const personen = useMemo(() => members.map((m) => m.id), [members])
  const sichtbar = spuren.filter((s) => !aus.includes(s.key))

  // Laden: Monatsraster (inkl. Raender) bis 14 Tage nach dem gewaehlten Tag
  const rasterStart = iso(montag(ausIso(monat + '-01')))
  const bisTag = [plus(rasterStart, 41), plus(tag, 14)].sort()[1]
  const laden = useCallback(async () => {
    const { data } = await supabase.from('events')
      .select('id, title, kind, client_id, clients(name), starts_on, ends_on, starts_at, ends_at, member_ids, notes, deleted_at')
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

  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => plus(tag, i)), [tag])

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
          <button onClick={() => monatWechseln(1)} aria-label="Nächster Monat"><ChevronRight /></button>
        </div>
        <div className="kal-raster">
          {WT.map((w) => <span key={w} className="kal-wt">{w}</span>)}
          {zellen.map((z) => {
            const punkte = sichtbar.filter((s) => amTag(z, s.key).length > 0)
            return (
              <button key={z} className={`kal-zelle ${z.slice(0, 7) !== monat ? 'fremd' : ''} ${z === heute ? 'heute' : ''} ${z === tag ? 'gewaehlt' : ''}`} onClick={() => waehlen(z)}>
                <span className="kal-nr">{Number(z.slice(8))}</span>
                <span className="kal-punkte">{punkte.map((s) => <i key={s.key} style={{ background: s.farbe }} />)}</span>
              </button>
            )
          })}
        </div>
        {tag !== heute && <button className="kal-heute" onClick={() => waehlen(heute)}>Heute</button>}
      </section>

      {/* Die naechsten 7 Tage, drei Spuren nebeneinander */}
      <div className="kal-tage" style={{ ['--spalten' as string]: sichtbar.length || 1 }}>
        <div className="kal-tage-kopf">
          <span />
          {sichtbar.map((s) => <span key={s.key} style={{ color: s.farbe }}>{s.name}</span>)}
        </div>
        {tage.map((t) => {
          const d = ausIso(t)
          const alleFrei = sichtbar.every((s) => amTag(t, s.key).length === 0)
          return (
            <section key={t} className={`kal-tag ${t === heute ? 'heute' : ''}`}>
              <div className="kal-tag-datum">
                <strong>{WT[(d.getDay() + 6) % 7]}</strong>
                <span>{d.getDate()}.{d.getMonth() + 1}.</span>
                {alleFrei && <em>frei</em>}
              </div>
              {sichtbar.map((s) => {
                const liste = amTag(t, s.key)
                return (
                  <div key={s.key} className="kal-spalte" onClick={(e) => { if (e.target === e.currentTarget) setModal({ termin: null, datum: t, wer: s.key === AGENTUR ? [] : [s.key] }) }}>
                    {liste.map((e) => (
                      <button key={e.id} className="kal-termin" style={{ ['--f' as string]: s.farbe }} onClick={() => setModal({ termin: e })}>
                        <small>{e.starts_at ? `${e.starts_at.slice(0, 5)}${e.ends_at ? '–' + e.ends_at.slice(0, 5) : ''}` : e.ends_on && e.ends_on !== e.starts_on ? 'mehrtägig' : 'ganztägig'}</small>
                        <strong>{e.title}</strong>
                        {e.clients?.name && <span>{e.clients.name}</span>}
                      </button>
                    ))}
                    {liste.length === 0 && !alleFrei && <span className="kal-frei">frei</span>}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
      <p className="kal-hinweis">Tipp auf eine leere Stelle = neuer Termin in dieser Spalte. Agentur-Termine betreffen euch beide.</p>

      {modal && (
        <TerminModal
          termin={modal.termin}
          datum={modal.datum}
          werVorgabe={modal.wer}
          userId={session?.user?.id ?? null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); laden() }}
        />
      )}
    </div>
  )
}
