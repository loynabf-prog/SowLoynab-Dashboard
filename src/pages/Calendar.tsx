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
import Tagesplan from '../components/Tagesplan'
import type { CalEventRow } from '../lib/types'
import { heute as heuteIso } from '../lib/datum'
import { AGENTUR, KATEGORIEN, MONATE, WT, ausIso, iso, kategorieVon, liegtAn, plus, spurVon, type Spur } from '../lib/kalender'
import '../styles/kalender.css'

const SPUR_FARBE = '#1d1d1f'
function montag(d: Date): Date { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }


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
