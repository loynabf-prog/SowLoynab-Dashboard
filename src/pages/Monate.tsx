// Monate: Kunden, Videos und Einnahmen je Monat planen.
// ---------------------------------------------------------------------------
// Oben ein Streifen mit Monaten (Summe je Monat), darunter der gewaehlte
// Monat: wer ist dabei, wie viele Videos, welcher Betrag, wie fest.
//
//   Vorschlag      kein Eintrag, Retainer des Kunden (grau)
//   Geplant        eingetragen, kann sich noch aendern
//   Fest           steht
//   Abgeschlossen  Monat ist durch, Zahlen eingefroren
//
// Rechnen und Speichern: lib/monate.ts. Tabelle client_month_plans (0046).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, Check, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, Clapperboard, Euro, HelpCircle, ListChecks, Lock, Plus, Users } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { useToast } from '../context/ToastContext'
import { useGemerkt, istGemerkt } from '../lib/merken'
import { schnellGepostet, linkSetzen, alsGepostet } from '../lib/videoAktionen'
import { profilUrl } from '../lib/accounts'
import { supabase } from '../lib/supabase'
import BereichReiter from '../components/BereichReiter'
import { rangVon } from '../lib/kundenart'
import {
  ladeMonatsDaten, monatsZeilen, monatsSumme, monatPlus, monatName, monatsKeyVon, istAbgeschlossen, vorlauf,
  speichereEintrag, entferneEintrag, monatSetzen, euro, videoZeilen, videoSumme, geldZeilen,
  monatsTodos, monatsKalender, drehtagEintragen, monatsCheck, videoGeprueft, ladeAccountsAlle,
  type KundeFuerMonat, type MonatsEintrag, type MonatsVideo, type MonatsZeile, type MonatStatus,
  type MonatsDrehtag, type MonatsAufgabe, type MonatsTodo, type Zahlstatus, type VideoZeile,
} from '../lib/monate'

// Aktueller Monat ganz links, nach rechts die Zukunft. Vergangenes nur auf Wunsch.
const VORHER = 3
const NACHHER = 8

const STAND_TEXT: Record<MonatsZeile['status'], string> = {
  vorschlag: 'Vorschlag', geplant: 'Geplant', unsicher: 'Unsicher ?', fest: 'Fest', abgeschlossen: 'Abgeschlossen',
}

export default function Monate() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const heuteKey = monatsKeyVon(new Date())
  const key = /^\d{4}-\d{2}$/.test(params.get('m') ?? '') ? params.get('m')! : heuteKey
  const von = monatPlus(heuteKey, -VORHER)
  const bis = monatPlus(heuteKey, NACHHER)

  const [kunden, setKunden] = useGemerkt<KundeFuerMonat[]>('monate.kunden', [])
  const [eintraege, setEintraege] = useGemerkt<MonatsEintrag[]>('monate.eintraege', [])
  const [videos, setVideos] = useGemerkt<MonatsVideo[]>('monate.videos', [])
  const [drehtage, setDrehtage] = useGemerkt<MonatsDrehtag[]>('monate.drehtage', [])
  const [aufgaben, setAufgaben] = useGemerkt<MonatsAufgabe[]>('monate.aufgaben', [])
  const [ansicht, setAnsicht] = useState<'kunden' | 'videos' | 'kalender' | 'todos' | 'check'>('videos')
  const [tagOffen, setTagOffen] = useState<string | null>(null)
  const [drehFuer, setDrehFuer] = useState<string>('')
  const [laedt, setLaedt] = useState(() => !istGemerkt('monate.kunden'))
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [dazuOffen, setDazuOffen] = useState(false)
  const [frueher, setFrueher] = useState(false)
  const streifen = useRef<HTMLDivElement>(null)
  // Gewaehlten Monat in die Mitte des Streifens holen
  useEffect(() => {
    const el = streifen.current?.querySelector<HTMLElement>('.m-monat.on')
    if (el && streifen.current) streifen.current.scrollTo({ left: Math.max(0, el.offsetLeft - 20), behavior: 'smooth' })
  }, [key, laedt])

  const laden = useCallback(async () => {
    const d = await ladeMonatsDaten(monatPlus(von, -1) < key ? monatPlus(von, -1) : key, monatPlus(bis, 1) > key ? monatPlus(bis, 1) : key)
    setFehler(d.fehler)
    setKunden(d.kunden)
    setEintraege(d.eintraege)
    setVideos(d.videos)
    setDrehtage(d.drehtage)
    setAufgaben(d.aufgaben)
    setLaedt(false)
  }, [von, bis, key])

  useEffect(() => { laden() }, [laden])

  const monate = useMemo(() => {
    const l: string[] = []
    for (let i = frueher ? -VORHER : 0; i <= NACHHER; i++) l.push(monatPlus(heuteKey, i))
    if (!l.includes(key)) l.push(key)
    return l.sort()
  }, [heuteKey, key, frueher])

  const proMonat = useMemo(() => new Map(monate.map((m) => {
    const z = monatsZeilen(m, heuteKey, kunden, eintraege, videos)
    const v = videoSumme(videoZeilen(m, heuteKey, kunden, eintraege, videos))
    return [m, { summe: monatsSumme(z), v, zu: istAbgeschlossen(eintraege, m) }]
  })), [monate, heuteKey, kunden, eintraege, videos])

  const zeilen = useMemo(() => monatsZeilen(key, heuteKey, kunden, eintraege, videos), [key, heuteKey, kunden, eintraege, videos])
  const dabei = zeilen.filter((z) => !z.nichtDabei)
  const geld = useMemo(() => geldZeilen(zeilen), [zeilen])
  const vz = useMemo(() => videoZeilen(key, heuteKey, kunden, eintraege, videos), [key, heuteKey, kunden, eintraege, videos])
  const vs = videoSumme(vz)
  // Vorlauf: immer der naechste Monat -- am Monatsende soll der komplett fertig sein.
  const naechster = monatPlus(heuteKey, 1)
  const vl = useMemo(() => vorlauf(naechster, heuteKey, kunden, eintraege, videos, rangVon), [naechster, heuteKey, kunden, eintraege, videos])
  const [vlAlle, setVlAlle] = useState(false)
  const nichtDabei = zeilen.filter((z) => z.nichtDabei)
  const summe = monatsSumme(zeilen)
  const todos = useMemo(() => monatsTodos(key, zeilen, drehtage, aufgaben, vz), [key, zeilen, drehtage, aufgaben, vz])
  const kalender = useMemo(() => monatsKalender(key, videos, drehtage), [key, videos, drehtage])
  const kundeName = useMemo(() => new Map(kunden.map((k) => [k.id, k.name])), [kunden])
  const postsImMonat = useMemo(() => videos.filter((v) => (v.scheduled_date ?? '').slice(0, 7) === key).length, [videos, key])
  const zu = istAbgeschlossen(eintraege, key)
  const offeneStaende = dabei.some((z) => z.status === 'geplant' || z.status === 'vorschlag')
  const nichtImMonat = kunden.filter((k) => !zeilen.some((z) => z.kunde.id === k.id))

  function waehle(m: string) {
    setOffen(null)
    setParams((p) => { const n = new URLSearchParams(p); n.set('m', m); return n }, { replace: true })
  }

  async function ausfuehren(p: Promise<string | null>, ok: string) {
    const f = await p
    if (f) { toast('Konnte nicht speichern: ' + f); return false }
    toast(ok)
    await laden()
    return true
  }

  return (
    <>
      <h1 className="h-gruss">Monate</h1>
      <BereichReiter />
      {fehler && <div className="n-gruppe"><div className="n-leer">Konnte nicht laden: {fehler}</div></div>}

      {/* Streifen */}
      <div className="m-streifen" role="tablist" aria-label="Monat" ref={streifen}>
        {!frueher && (
          <button className="m-monat m-frueher" onClick={() => setFrueher(true)} aria-label="Frühere Monate zeigen">
            <span className="m-name">Früher</span><strong>‹</strong><small>zeigen</small>
          </button>
        )}
        {monate.map((m) => {
          const s = proMonat.get(m)!
          const gesamt = s.summe.fest + s.summe.geplant + s.summe.unsicher + s.summe.vorschlag
          return (
            <button key={m} role="tab" aria-selected={m === key}
              className={`m-monat ${m === key ? 'on' : ''} ${m === heuteKey ? 'jetzt' : ''} ${m < heuteKey ? 'vorbei' : ''}`}
              onClick={() => waehle(m)}>
              <span className="m-name">{monatName(m, true)}{s.zu && <Lock />}</span>
              <strong>{gesamt ? euro(gesamt) : '–'}</strong>
              <small>{m < heuteKey ? `${s.v.gepostet} gepostet` : s.v.gepostet + s.v.geplant ? `${s.v.gepostet + s.v.geplant} Videos` : 'keine Videos'}</small>
            </button>
          )
        })}
      </div>

      <div className="n-abschnitt">
        <h2>{monatName(key)}</h2>
        <span>{zu ? 'abgeschlossen' : key === heuteKey ? 'laufender Monat' : key < heuteKey ? 'vorbei' : 'kommt'}</span>
      </div>

      <div className="m-zahlen">
        <div><span className="app-ic klein gruen"><Euro strokeWidth={2.2} /></span><b>{euro(summe.fest + summe.geplant + summe.unsicher + summe.vorschlag)}</b></div>
        <div><span className="app-ic klein blau"><Users strokeWidth={2.2} /></span><b>{geld.length}</b></div>
        <div><span className="app-ic klein glut"><Clapperboard strokeWidth={2.2} /></span><b>{vs.ziel || vs.gepostet + vs.geplant}</b></div>
      </div>

      {/* Vorlauf naechster Monat: Ziel ist, ihn am Monatsende fertig zu haben */}
      {vl.soll > 0 && (
        <div className="vl-karte">
          <button type="button" className="vl-kopf" onClick={() => waehle(naechster)}>
            <span>
              <strong>{monatName(naechster)}</strong>
              <small>{vl.fertig}/{vl.soll} fertig</small>
            </span>
            <b className={vl.fertig >= vl.soll ? 'ok' : ''}>{Math.round((vl.fertig / vl.soll) * 100)} %</b>
          </button>
          <div className="vl-balken">
            <i className="eingeplant" style={{ width: `${Math.min(100, (vl.eingeplant / vl.soll) * 100)}%` }} />
            <i className="fertig" style={{ width: `${Math.min(100, (Math.max(0, vl.fertig - vl.eingeplant) / vl.soll) * 100)}%` }} />
          </div>
          <ul className="vl-liste">
            {(vlAlle ? vl.zeilen : vl.zeilen.slice(0, 5)).map((z) => (
              <li key={z.kunde.id}>
                <button type="button" onClick={() => navigate(`/client/${z.kunde.id}`)}>
                  <LogoFrame name={z.kunde.name} logoUrl={z.kunde.logo_url} className="vl-logo" />
                  <span className="vl-name">{z.kunde.name}</span>
                  <span className="vl-mini"><i style={{ width: `${Math.min(100, (z.fertig / (z.soll || 1)) * 100)}%` }} /></span>
                  <span className={`vl-zahl ${z.fertig >= z.soll ? 'ok' : ''}`}>{z.fertig}/{z.soll}</span>
                </button>
              </li>
            ))}
          </ul>
          {vl.zeilen.length > 5 && (
            <button type="button" className="n-mehr-link" onClick={() => setVlAlle((a) => !a)}>{vlAlle ? '–' : `+${vl.zeilen.length - 5}`}</button>
          )}
        </div>
      )}

      <div className="m-label">Geld</div>
      <div className="p-lage klickbar" role="button" tabIndex={0} onClick={() => setAnsicht('kunden')}>
        <div><strong>{euro(summe.fest + summe.geplant + summe.unsicher + summe.vorschlag)}</strong><span>Einnahmen</span></div>
        <div className={summe.bezahlt ? 'gruen' : 'null'}><strong>{euro(summe.bezahlt)}</strong><span>schon bezahlt</span></div>
        <div><strong>{euro(Math.max(0, summe.fest + summe.geplant + summe.unsicher + summe.vorschlag - summe.bezahlt))}</strong><span>noch nicht bezahlt</span></div>
      </div>
      {(summe.rechnung > 0 || summe.geplant > 0 || summe.unsicher > 0 || summe.vorschlag > 0) && (
        <p className="p-fuss" style={{ marginTop: -8, marginBottom: 12 }}>
          {[
            summe.fest > 0 ? `${euro(summe.fest)} fest` : null,
            summe.rechnung > 0 ? `${euro(summe.rechnung)} Rechnung raus` : null,
            summe.geplant > 0 ? `${euro(summe.geplant)} geplant` : null,
            summe.unsicher > 0 ? `${euro(summe.unsicher)} unsicher` : null,
            summe.vorschlag > 0 ? `${euro(summe.vorschlag)} nur Vorschlag (Retainer)` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="m-label">Videos</div>
      <div className="p-lage klickbar" role="button" tabIndex={0} onClick={() => setAnsicht('videos')}>
        <div className={vs.gepostet ? 'gruen' : 'null'}><strong>{vs.gepostet}</strong><span>gepostet</span></div>
        <div><strong>{vs.geplant}</strong><span>mit Posting-Tag</span></div>
        <div><strong>{vs.ziel || '–'}</strong><span>vorgenommen</span></div>
      </div>

      <div className="m-aktionen">
        {zu ? (
          <button className="n-tun" onClick={() => ausfuehren(monatSetzen(key, dabei.filter((z) => z.herkunft === 'eintrag').concat(nichtDabei), 'fest'), 'Monat wieder geöffnet')}>
            Wieder öffnen
          </button>
        ) : (
          <>
            {offeneStaende && dabei.length > 0 && (
              <button className="n-tun" onClick={() => ausfuehren(monatSetzen(key, [...dabei, ...nichtDabei], 'fest'), `${monatName(key)} steht fest`)}>
                <Check strokeWidth={2.6} /> Alles festmachen
              </button>
            )}
            {key <= heuteKey && dabei.length > 0 && (
              <button className="n-tun stark" onClick={() => ausfuehren(monatSetzen(key, [...dabei, ...nichtDabei], 'abgeschlossen'), `${monatName(key)} abgeschlossen`)}>
                <Lock strokeWidth={2.4} /> Monat abschließen
              </button>
            )}
          </>
        )}
      </div>

      <div className="n-segment eng" role="tablist" aria-label="Ansicht">
        <button className={ansicht === 'videos' ? 'on' : ''} onClick={() => setAnsicht('videos')}>Kunden & Videos <small>{vz.length}</small></button>
        <button className={ansicht === 'kunden' ? 'on' : ''} onClick={() => setAnsicht('kunden')}>Geld <small>{geld.length}</small></button>
        <button className={ansicht === 'kalender' ? 'on' : ''} onClick={() => setAnsicht('kalender')}>Kalender <small>{postsImMonat}</small></button>
        <button className={ansicht === 'todos' ? 'on' : ''} onClick={() => setAnsicht('todos')}>To-dos <small>{todos.length}</small></button>
        <button className={ansicht === 'check' ? 'on' : ''} onClick={() => setAnsicht('check')}>Prüfen</button>
      </div>

      {ansicht === 'kalender' && (
        <Kalender
          wochen={kalender}
          heute={new Date().toISOString().slice(0, 10)}
          kundeName={kundeName}
          tagOffen={tagOffen}
          onTag={(t) => setTagOffen(tagOffen === t ? null : t)}
          kunden={dabei.map((z) => z.kunde)}
          drehFuer={drehFuer}
          onDrehFuer={setDrehFuer}
          onDrehtag={async (clientId, datum, anzahl) => {
            const ok = await ausfuehren(drehtagEintragen(clientId, kundeName.get(clientId) ?? 'Kunde', datum, anzahl), 'Drehtag eingetragen')
            if (ok) setTagOffen(datum)
          }}
          monat={key}
        />
      )}

      {ansicht === 'check' && (
        <MonatsCheckAnsicht monat={key} kunden={kunden} videos={videos} onGeaendert={laden} />
      )}

      {ansicht === 'todos' && (
        <div className="n-gruppe">
          {todos.length === 0 ? <div className="n-leer">{laedt ? 'Lade …' : 'Für diesen Monat ist alles erledigt.'}</div> : todos.map((t) => (
            <TodoZeile key={t.key} t={t} monat={key}
              onAnlegen={() => t.client_id && navigate(`/client/${t.client_id}?plan=${key}`)}
              onDrehtag={() => { setDrehFuer(t.client_id ?? ''); setAnsicht('kalender') }}
              onKunde={() => { setAnsicht('kunden'); setOffen(t.client_id ?? null) }}
            />
          ))}
        </div>
      )}

      {ansicht === 'kunden' && <div className="n-gruppe">
        {geld.length === 0 ? (
          <div className="n-leer">{laedt ? 'Lade …' : 'Für diesen Monat ist noch kein Geld eingetragen.'}</div>
        ) : geld.map((z) => (
          <KundenZeile
            key={z.kunde.id}
            z={z}
            monat={key}
            gesperrt={zu}
            offen={offen === z.kunde.id}
            onToggle={() => setOffen(offen === z.kunde.id ? null : z.kunde.id)}
            onKunde={() => navigate(`/client/${z.kunde.id}`)}
            onSpeichern={(e) => ausfuehren(speichereEintrag({ client_id: z.kunde.id, month_key: key, ...e }), 'Gespeichert')}
            onNichtDabei={() => ausfuehren(speichereEintrag({ client_id: z.kunde.id, month_key: key, quota: z.soll, betrag: 0, status: 'fest', notiz: z.eintrag?.notiz ?? null, dabei: true }), `${z.kunde.name}: kein Geld im ${monatName(key, true)}`)}
            onZurueck={() => ausfuehren(entferneEintrag(z.kunde.id, key), 'Eintrag entfernt')}
          />
        ))}
      </div>}

      {ansicht === 'videos' && (
        <div className="n-gruppe">
          {vz.length === 0 ? <div className="n-leer">{laedt ? 'Lade …' : 'Noch keine Videos in diesem Monat.'}</div> : vz.map((v) => (
            <VideoZeileUI key={v.kunde.id} v={v} offen={offen === 'v' + v.kunde.id}
              onToggle={() => setOffen(offen === 'v' + v.kunde.id ? null : 'v' + v.kunde.id)}
              onPlanen={() => navigate(`/client/${v.kunde.id}?plan=${key}`)}
              onKunde={() => navigate(`/client/${v.kunde.id}`)}
              onVideo={(id) => navigate(`/client/${v.kunde.id}?video=${id}&open=1`)}
              onGepostet={key === heuteKey ? async () => {
                const ok = await ausfuehren(schnellGepostet(v.kunde.id), 'Video gepostet – Link, Zahlen und Titel werden geholt')
                if (ok) setTimeout(() => laden(), 100_000)
              } : undefined}
              onZiel={(ziel) => ausfuehren(speichereEintrag(v.eintrag
                ? { ...v.eintrag, quota: ziel }
                : {
                    client_id: v.kunde.id, month_key: key, quota: ziel,
                    // Ohne Geld-Eintrag: zahlende Kunden bekommen ihren Retainer, sonst 0 EUR
                    betrag: (v.kunde.client_type ?? 'zahlend') === 'zahlend' ? (Number(v.kunde.monthly_fee) || null) : 0,
                    status: 'geplant', notiz: null,
                  }), 'Vorhaben gespeichert')}
            />
          ))}
        </div>
      )}
      {ansicht === 'videos' && <p className="p-fuss">Gezählt werden die echten Videos: gepostet im Monat, in dem sie rausgingen, sonst nach Posting-Tag. Unabhängig vom Geld.</p>}

      {ansicht === 'kunden' && !zu && (
        <div className="n-abschnitt" style={{ marginTop: 14 }}>
          <button className="n-mehr-link" style={{ marginLeft: 0 }} onClick={() => setDazuOffen((x) => !x)}>
            <Plus strokeWidth={2.6} style={{ width: 15, height: 15, verticalAlign: -2 }} /> Kunde dazunehmen
          </button>
        </div>
      )}
      {ansicht === 'kunden' && dazuOffen && !zu && (
        <div className="n-gruppe">
          {nichtImMonat.length === 0 ? <div className="n-leer">Alle Kunden sind schon in diesem Monat.</div> : nichtImMonat.map((k) => (
            <button key={k.id} className="n-zeile" onClick={async () => {
              const ok = await ausfuehren(speichereEintrag({
                client_id: k.id, month_key: key, quota: k.monthly_quota ?? 0,
                betrag: Number(k.monthly_fee) || 0, status: 'geplant', notiz: null,
              }), `${k.name} im ${monatName(key, true)} eingetragen`)
              if (ok) { setDazuOffen(false); setOffen(k.id) }
            }}>
              <LogoFrame name={k.name} logoUrl={k.logo_url} className="a-logo" />
              <span className="n-text">
                <span className="n-titel">{k.name}</span>
                <span className="n-unter">{k.monthly_quota ? `Retainer ${k.monthly_quota} Videos · ${euro(Number(k.monthly_fee) || 0)}` : 'ohne Retainer'}</span>
              </span>
              <Plus className="n-chevron" />
            </button>
          ))}
        </div>
      )}

      {ansicht === 'kunden' && nichtDabei.length > 0 && (
        <>
          <div className="n-abschnitt"><h2>Nicht dabei</h2><span>in diesem Monat</span></div>
          <div className="n-gruppe">
            {nichtDabei.map((z) => (
              <div key={z.kunde.id} className="n-zeile a-vgl">
                <LogoFrame name={z.kunde.name} logoUrl={z.kunde.logo_url} className="a-logo" />
                <span className="n-text">
                  <span className="n-titel">{z.kunde.name}</span>
                  <span className="n-unter">{z.videos.length ? `${z.videos.length} Videos liegen trotzdem in diesem Monat` : 'kein Auftrag'}</span>
                </span>
                {!zu && <button className="n-tun" onClick={() => ausfuehren(entferneEintrag(z.kunde.id, key), `${z.kunde.name} wieder dabei`)}>Wieder dazu</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {ansicht === 'kunden' && (
        <p className="p-fuss">
          Geld und Videos sind getrennt: Hier steht nur, was ein Kunde im Monat zahlt. Ohne Eintrag schlägt die App
          für diesen und kommende Monate den Retainer vor; vergangene Monate zählen nur, was eingetragen ist.
        </p>
      )}
    </>
  )
}

function KundenZeile({
  z, monat, gesperrt, offen, onToggle, onKunde, onSpeichern, onNichtDabei, onZurueck,
}: {
  z: MonatsZeile
  monat: string
  gesperrt: boolean
  offen: boolean
  onToggle: () => void
  onKunde: () => void
  onSpeichern: (e: { quota: number; betrag: number | null; status: MonatStatus; notiz: string | null; zahlung_monat: string | null; zahlstatus: Zahlstatus }) => void
  onNichtDabei: () => void
  onZurueck: () => void
}) {
  const [quota, setQuota] = useState(String(z.soll))
  void setQuota
  const [betrag, setBetrag] = useState(String(z.betrag || ''))
  const startStatus = (): MonatStatus => (z.status === 'fest' || z.status === 'unsicher' ? z.status : 'geplant')
  const [status, setStatus] = useState<MonatStatus>(startStatus())
  const [notiz, setNotiz] = useState(z.eintrag?.notiz ?? '')
  const [zahlung, setZahlung] = useState(z.eintrag?.zahlung_monat ?? '')
  const [zahlstatus, setZahlstatus] = useState<Zahlstatus>(z.eintrag?.zahlstatus ?? 'offen')
  useEffect(() => {
    setQuota(String(z.soll)); setBetrag(String(z.betrag || ''))
    setStatus(startStatus()); setNotiz(z.eintrag?.notiz ?? ''); setZahlung(z.eintrag?.zahlung_monat ?? ''); setZahlstatus(z.eintrag?.zahlstatus ?? 'offen')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z.soll, z.betrag, z.status, z.eintrag?.notiz, z.eintrag?.zahlung_monat, z.eintrag?.zahlstatus])

  const unter = [
    z.eintrag && z.eintrag.betrag == null ? 'Betrag fehlt' : null,
    z.eintrag?.notiz ?? null,
    z.eintrag?.zahlung_monat && z.eintrag.zahlung_monat !== monat ? `Geld erst im ${monatName(z.eintrag.zahlung_monat, true)}` : null,
    z.kunde.pausiert_seit ? 'pausiert' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <button className="n-zeile" onClick={onToggle} aria-expanded={offen}>
        <KundenLogo id={z.kunde.id} name={z.kunde.name} logo={z.kunde.logo_url} />
        <span className="n-text">
          <span className="n-titel">{z.kunde.name}</span>
          <span className="n-unter">{unter}</span>
        </span>
        <span className="a-wert-block">
          <b className={z.status === 'vorschlag' ? 'm-grau' : ''}>{euro(z.betrag)}</b>
          {z.herkunft === 'eintrag' && z.betrag > 0 && (
            <small className={`m-geld ${z.eintrag?.zahlstatus ?? 'offen'}`}>{z.eintrag?.zahlstatus === 'bezahlt' ? 'bezahlt' : z.eintrag?.zahlstatus === 'rechnung' ? 'Rechnung raus' : 'nicht bezahlt'}</small>
          )}
          <small className={`m-stand ${z.status}`}>{z.status === 'vorschlag' && z.soll === 0 && z.betrag === 0 ? 'ohne Eintrag' : STAND_TEXT[z.status]}</small>
        </span>
        {offen ? <ChevronUp className="n-chevron" /> : <ChevronDown className="n-chevron" />}
      </button>
      {offen && (
        <div className="z-auf m-auf">
          {!gesperrt && (
            <>
              <div className="m-felder">
                <label style={{ gridColumn: '1 / -1' }}>Betrag (€, netto)<input type="number" min={0} step="1" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0" /></label>
              </div>
              <div className="n-segment" style={{ margin: 0 }}>
                <button className={status === 'geplant' ? 'on' : ''} onClick={() => setStatus('geplant')}>Geplant</button>
                <button className={status === 'unsicher' ? 'on' : ''} onClick={() => setStatus('unsicher')}>Unsicher ?</button>
                <button className={status === 'fest' ? 'on' : ''} onClick={() => setStatus('fest')}>Steht fest</button>
              </div>
              <div className="n-segment" style={{ margin: 0 }}>
                <button className={zahlstatus === 'offen' ? 'on' : ''} onClick={() => setZahlstatus('offen')}>Nicht bezahlt</button>
                <button className={zahlstatus === 'rechnung' ? 'on' : ''} onClick={() => setZahlstatus('rechnung')}>Rechnung raus</button>
                <button className={zahlstatus === 'bezahlt' ? 'on' : ''} onClick={() => setZahlstatus('bezahlt')}>Bezahlt</button>
              </div>
              <label className="m-zahlung">Geld kommt
                <select value={zahlung} onChange={(e) => setZahlung(e.target.value)}>
                  <option value="">im selben Monat</option>
                  {[1, 2, 3].map((n) => { const m = monatPlus(monat, n); return <option key={m} value={m}>erst im {monatName(m)}</option> })}
                </select>
              </label>
              <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz, z. B. Rechnung am 5. schicken" />
              <div className="m-knoepfe">
                <button className="n-tun stark" onClick={() => onSpeichern({
                  quota: Math.max(0, Math.round(Number(quota) || 0)), // Videoziel bleibt, wie es ist
                  betrag: betrag.trim() === '' ? null : Math.max(0, Number(betrag.replace(',', '.')) || 0),
                  status, notiz: notiz.trim() || null, zahlung_monat: zahlung || null, zahlstatus,
                })}>Speichern</button>
                <button className="n-tun" onClick={onNichtDabei}>Kein Geld diesen Monat</button>
                {z.herkunft === 'eintrag' && <button className="z-link" onClick={onZurueck}>Eintrag entfernen</button>}
                <button className="z-link" onClick={onKunde}>Kundenakte</button>
              </div>
            </>
          )}
          {gesperrt && z.eintrag?.notiz && <p className="p-fuss" style={{ margin: 0 }}>{z.eintrag.notiz}</p>}

        </div>
      )}
    </div>
  )
}

// ============================ Kalender ============================
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function Kalender({
  wochen, heute, kundeName, tagOffen, onTag, kunden, drehFuer, onDrehFuer, onDrehtag, monat,
}: {
  wochen: ReturnType<typeof monatsKalender>
  heute: string
  kundeName: Map<string, string>
  tagOffen: string | null
  onTag: (t: string) => void
  kunden: KundeFuerMonat[]
  drehFuer: string
  onDrehFuer: (id: string) => void
  onDrehtag: (clientId: string, datum: string, anzahl: number | null) => void
  monat: string
}) {
  const tag = tagOffen ? wochen.flat().find((t) => t.datum === tagOffen) : null
  const [datum, setDatum] = useState('')
  const [anzahl, setAnzahl] = useState('')
  const kurz = (id: string | null) => (kundeName.get(id ?? '') ?? '?').split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <>
      <div className="m-kal">
        {WT.map((w) => <span key={w} className="m-kal-kopf">{w}</span>)}
        {wochen.flat().map((t) => (
          <button key={t.datum} onClick={() => onTag(t.datum)}
            className={`m-kal-tag ${t.imMonat ? '' : 'aussen'} ${t.datum === heute ? 'heute' : ''} ${t.datum === tagOffen ? 'on' : ''}`}>
            <span className="m-kal-zahl">{Number(t.datum.slice(8))}</span>
            <span className="m-kal-inhalt">
              {t.drehtage.length > 0 && <Camera className="m-kal-dreh" />}
              {t.posts.slice(0, 3).map((v) => (
                <i key={v.id} className={v.status === 'posted' ? 'gepostet' : ''}>{kurz(v.client_id)}</i>
              ))}
              {t.posts.length > 3 && <i className="mehr">+{t.posts.length - 3}</i>}
            </span>
          </button>
        ))}
      </div>
      <p className="p-fuss" style={{ marginTop: 6 }}>Kürzel = Posting des Kunden · Kamera = Drehtag · Tag antippen für Details</p>

      {tag && (
        <>
          <div className="n-abschnitt"><h2>{new Date(tag.datum + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>
          <div className="n-gruppe">
            {tag.drehtage.map((d) => (
              <div key={d.id} className="n-zeile a-vgl">
                <span className="n-ic lila"><Camera strokeWidth={2.2} /></span>
                <span className="n-text"><span className="n-titel">{d.title}</span>
                  <span className="n-unter">{d.planned_videos ? `${d.planned_videos} Videos geplant` : 'Drehtag'}</span></span>
              </div>
            ))}
            {tag.posts.map((v) => (
              <div key={v.id} className="n-zeile a-vgl">
                <span className={`n-ic ${v.status === 'posted' ? 'gruen' : 'grau'}`}><Clapperboard strokeWidth={2.2} /></span>
                <span className="n-text"><span className="n-titel">{v.title || 'Video'}</span>
                  <span className="n-unter">{kundeName.get(v.client_id) ?? 'Kunde'}{v.scheduled_time ? ` · ${v.scheduled_time.slice(0, 5)}` : ''}</span></span>
                <span className="a-wert dim">{v.status === 'posted' ? 'gepostet' : 'offen'}</span>
              </div>
            ))}
            {tag.posts.length === 0 && tag.drehtage.length === 0 && <div className="n-leer">An diesem Tag ist nichts geplant.</div>}
          </div>
        </>
      )}

      <div className="n-abschnitt"><h2>Drehtag eintragen</h2><span>ohne Erinnerung</span></div>
      <div className="n-gruppe m-dreh-form">
        <select value={drehFuer} onChange={(e) => onDrehFuer(e.target.value)}>
          <option value="">Kunde wählen …</option>
          {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <input type="date" value={datum || tagOffen || ''} min={monatPlus(monat, -1) + '-01'} onChange={(e) => setDatum(e.target.value)} />
        <input type="number" min={0} inputMode="numeric" placeholder="Videos" value={anzahl} onChange={(e) => setAnzahl(e.target.value)} />
        <button className="n-tun stark" disabled={!drehFuer || !(datum || tagOffen)}
          onClick={() => { onDrehtag(drehFuer, datum || tagOffen!, anzahl ? Number(anzahl) : null); setAnzahl(''); setDatum('') }}>
          Eintragen
        </button>
      </div>
    </>
  )
}

// ============================ To-dos ============================
const TODO_IC = {
  anlegen: { icon: Plus, farbe: 'blau' },
  drehtag: { icon: Camera, farbe: 'lila' },
  zahlung: { icon: CircleDollarSign, farbe: 'gruen' },
  klaeren: { icon: HelpCircle, farbe: 'gelb' },
  aufgabe: { icon: ListChecks, farbe: 'grau' },
} as const

function TodoZeile({ t, onAnlegen, onDrehtag, onKunde }: {
  t: MonatsTodo
  monat: string
  onAnlegen: () => void
  onDrehtag: () => void
  onKunde: () => void
}) {
  const ic = TODO_IC[t.art]
  const knopf = t.art === 'anlegen' ? { text: 'Planen', tun: onAnlegen }
    : t.art === 'drehtag' ? { text: 'Eintragen', tun: onDrehtag }
    : t.art === 'zahlung' || t.art === 'klaeren' ? { text: 'Öffnen', tun: onKunde }
    : null
  return (
    <div className="n-zeile a-vgl m-todo">
      <span className={`n-ic ${ic.farbe}`}><ic.icon strokeWidth={2.2} /></span>
      <span className="n-text">
        <span className="n-titel">{t.text}</span>
        {t.unter && <span className="n-unter">{t.unter}</span>}
      </span>
      {knopf && <button className="n-tun" onClick={knopf.tun}>{knopf.text}</button>}
    </div>
  )
}

// ============================ Videos je Kunde ============================
function VideoZeileUI({ v, offen, onToggle, onPlanen, onZiel, onGepostet, onKunde, onVideo }: {
  v: VideoZeile
  onKunde: () => void
  onVideo: (id: string) => void
  offen: boolean
  onToggle: () => void
  onPlanen: () => void
  onZiel: (ziel: number) => void
  /** Nur im laufenden Monat: Video ist draussen, aber nicht angelegt. */
  onGepostet?: () => void
}) {
  const [ziel, setZiel] = useState(String(v.ziel || ''))
  useEffect(() => { setZiel(String(v.ziel || '')) }, [v.ziel])
  const da = v.gepostet.length + v.geplant.length
  const fehlt = Math.max(0, v.ziel - da)
  const unter = [
    `${v.gepostet.length} gepostet`,
    v.geplant.length ? `${v.geplant.length} mit Posting-Tag` : null,
    fehlt ? `${fehlt} noch ohne Tag` : null,
    v.zielHerkunft === 'retainer' ? 'Ziel = Retainer' : null,
  ].filter(Boolean).join(' · ')
  const datum = (x: MonatsVideo) => {
    const d = x.status === 'posted' && x.posted_at ? x.posted_at.slice(0, 10) : x.scheduled_date
    return d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''
  }
  return (
    <div>
      <button className="n-zeile" onClick={onToggle} aria-expanded={offen}>
        <KundenLogo id={v.kunde.id} name={v.kunde.name} logo={v.kunde.logo_url} />
        <span className="n-text">
          <span className="n-titel">{v.kunde.name}</span>
          <span className="n-unter">{unter}</span>
        </span>
        <span className="a-wert-block">
          <b>{v.gepostet.length}{v.ziel ? <span className="m-grau">/{v.ziel}</span> : null}</b>
          <small>gepostet</small>
        </span>
        {offen ? <ChevronUp className="n-chevron" /> : <ChevronDown className="n-chevron" />}
      </button>
      {offen && (
        <div className="z-auf m-auf">
          <div className="z-feld">
            <label className="m-zahlung" style={{ flex: 1 }}>Vorgenommen für den Monat
              <input type="number" min={0} inputMode="numeric" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder="0" style={{ width: 90 }} />
            </label>
            <button className="n-tun stark" onClick={() => onZiel(Math.max(0, Math.round(Number(ziel) || 0)))}>Speichern</button>
          </div>
          <div className="m-knoepfe">
            {onGepostet && <button className="n-tun glut" onClick={onGepostet}>Video gepostet</button>}
            {fehlt > 0 && <button className="n-tun" onClick={onPlanen}>{fehlt} Posting-Tage planen</button>}
            <button className="n-tun" onClick={onKunde}>Kundenakte</button>
          </div>
          <div className="m-videos">
            {[...v.gepostet, ...v.geplant].map((x) => (
              <button key={x.id} type="button" className="m-video m-video-knopf" onClick={() => onVideo(x.id)}>
                <span className={`m-punkt ${x.status === 'posted' ? 'gruen' : ''}`} />
                <span className="m-vtitel">{x.title || 'Video'}<small>{datum(x)}{x.status === 'posted' ? ' · gepostet' : ''}</small></span>
                <ChevronRight className="n-chevron" />
              </button>
            ))}
            {da === 0 && <p className="p-fuss" style={{ margin: 0 }}>Noch keine Videos.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================ Monats-Check (Nachkontrolle) ============================
function MonatsCheckAnsicht({ monat, kunden, videos, onGeaendert }: {
  monat: string
  kunden: KundeFuerMonat[]
  videos: MonatsVideo[]
  onGeaendert: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<{ client_id: string; platform: string; handle: string }[]>([])
  const [offenK, setOffenK] = useState<string | null>(null)
  useEffect(() => { ladeAccountsAlle().then(setAccounts) }, [])
  const heute = new Date().toISOString().slice(0, 10)
  const plattformen = useCallback((id: string) => {
    const p = [...new Set(accounts.filter((a) => a.client_id === id).map((a) => a.platform))]
      .filter((x): x is 'tiktok' | 'instagram' => x === 'tiktok' || x === 'instagram')
    return p.length ? p : (['tiktok', 'instagram'] as ('tiktok' | 'instagram')[])
  }, [accounts])
  const liste = useMemo(() => monatsCheck(monat, heute, kunden, videos, plattformen), [monat, heute, kunden, videos, plattformen])
  const gesamt = liste.reduce((s, k) => s + k.videos.length, 0)
  const ok = liste.reduce((s, k) => s + k.videos.length - k.offen, 0)

  async function tun(p: Promise<string | null>, meldung: string) {
    const f = await p
    if (f) { toast('Konnte nicht speichern: ' + f); return }
    toast(meldung)
    await onGeaendert()
  }

  return (
    <>
      <div className="mc-kopf">
        <div className="mc-balken"><i style={{ width: gesamt ? `${(ok / gesamt) * 100}%` : '0%' }} /></div>
        <span>{ok} von {gesamt} Videos geprüft</span>
      </div>
      <p className="p-fuss" style={{ margin: '0 4px 12px' }}>
        Je Kunde: Profil öffnen, jedes Video antippen und vergleichen, dann abhaken. Fehlt ein Link oder ist er falsch, hier korrigieren.
      </p>
      {liste.length === 0 && <div className="n-gruppe"><div className="n-leer">In diesem Monat gibt es keine Videos.</div></div>}
      {liste.map((k) => {
        const accs = accounts.filter((a) => a.client_id === k.kunde.id)
        const auf = offenK === k.kunde.id || (offenK === null && k.offen > 0 && liste.find((x) => x.offen > 0)?.kunde.id === k.kunde.id)
        return (
          <div key={k.kunde.id} className="mc-kunde">
            <button className="mc-kunde-kopf" onClick={() => setOffenK(auf ? '' : k.kunde.id)} aria-expanded={auf}>
              <KundenLogo id={k.kunde.id} name={k.kunde.name} logo={k.kunde.logo_url} />
              <span className="n-text">
                <span className="n-titel">{k.kunde.name}</span>
                <span className="n-unter">{k.offen ? `${k.offen} von ${k.videos.length} offen` : `alle ${k.videos.length} geprüft`}</span>
              </span>
              {k.offen === 0 ? <span className="mc-ok"><Check strokeWidth={3} /></span> : null}
              {auf ? <ChevronUp className="n-chevron" /> : <ChevronDown className="n-chevron" />}
            </button>
            {auf && (
              <>
                <div className="mc-profile">
                  {accs.map((a) => (
                    <a key={a.platform + a.handle} className="n-tun" href={profilUrl(a.platform as 'tiktok' | 'instagram', a.handle)} target="_blank" rel="noopener noreferrer">
                      {a.platform === 'tiktok' ? 'TikTok' : 'Instagram'} öffnen ↗
                    </a>
                  ))}
                  {accs.length === 0 && <span className="p-fuss" style={{ margin: 0 }}>Keine Accounts hinterlegt.</span>}
                </div>
                <div className="n-gruppe">
                  {k.videos.map((c) => (
                    <CheckZeile key={c.video.id} c={c}
                      onGeprueft={(ja) => tun(videoGeprueft(c.video.id, ja), ja ? 'Abgehakt' : 'Wieder offen')}
                      onLink={(feld, url) => tun(linkSetzen(c.video.id, feld, url), 'Link gespeichert')}
                      onLinkWeg={(feld) => tun((async () => {
                        const { error } = await supabase.from('videos').update({ [feld]: null, geprueft_am: null }).eq('id', c.video.id)
                        return error ? error.message : null
                      })(), 'Link entfernt')}
                      onGepostet={() => tun(alsGepostet({ id: c.video.id }), 'Als gepostet markiert – Links werden geholt')}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Logo in einer Zeile: Tipp darauf fuehrt zur Kundenakte, ohne die Zeile aufzuklappen. */
function KundenLogo({ id, name, logo }: { id: string; name: string; logo: string | null }) {
  const navigate = useNavigate()
  return (
    <span className="z-logo-knopf" role="link" tabIndex={0} title={`${name} öffnen`}
      onClick={(e) => { e.stopPropagation(); navigate(`/client/${id}`) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`/client/${id}`) } }}>
      <LogoFrame name={name} logoUrl={logo} className="a-logo" />
    </span>
  )
}

const CHECK_TEXT = { verpasst: 'nicht gepostet', link_fehlt: 'Link fehlt', ungeprueft: 'noch nicht geprüft', ok: 'passt' } as const

function CheckZeile({ c, onGeprueft, onLink, onLinkWeg, onGepostet }: {
  c: ReturnType<typeof monatsCheck>[number]['videos'][number]
  onGeprueft: (ja: boolean) => void
  onLink: (feld: 'tiktok_url' | 'instagram_url', url: string) => void
  onLinkWeg: (feld: 'tiktok_url' | 'instagram_url') => void
  onGepostet: () => void
}) {
  const v = c.video
  const [eingabe, setEingabe] = useState<Record<string, string>>({})
  const datum = (v.status === 'posted' && v.posted_at ? v.posted_at.slice(0, 10) : v.scheduled_date) ?? ''
  const felder: { feld: 'tiktok_url' | 'instagram_url'; name: string; url: string | null | undefined; noetig: boolean }[] = [
    { feld: 'tiktok_url', name: 'TikTok', url: v.tiktok_url, noetig: c.fehlt.includes('tiktok') },
    { feld: 'instagram_url', name: 'Instagram', url: v.instagram_url, noetig: c.fehlt.includes('instagram') },
  ]
  return (
    <div className={`mc-zeile ${c.problem}`}>
      <div className="mc-zeile-oben">
        <span className="n-text">
          <Link className="n-titel mc-titel" to={`/client/${v.client_id}?video=${v.id}&open=1`} title="Video-Details">{v.title || 'Video'}</Link>
          <span className="n-unter">
            {datum ? new Date(datum + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'ohne Datum'}
            {' · '}<b className={`mc-stand ${c.problem}`}>{CHECK_TEXT[c.problem]}</b>
          </span>
        </span>
        {v.status === 'posted'
          ? <button className={`mc-haken ${v.geprueft_am ? 'on' : ''}`} onClick={() => onGeprueft(!v.geprueft_am)} disabled={c.fehlt.length > 0} aria-label="Passt">
              <Check strokeWidth={3} />
            </button>
          : <button className="n-tun glut" onClick={onGepostet}>Gepostet</button>}
      </div>
      {v.status === 'posted' && (
        <div className="mc-links">
          {felder.map((f) => f.url ? (
            <span key={f.feld} className="mc-link">
              <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name} ansehen ↗</a>
              <button onClick={() => onLinkWeg(f.feld)} aria-label={`${f.name}-Link entfernen`} title="Falsches Video? Link entfernen">×</button>
            </span>
          ) : f.noetig ? (
            <span key={f.feld} className="mc-eingabe">
              <input placeholder={`${f.name}-Link einfügen`} value={eingabe[f.feld] ?? ''} onChange={(e) => setEingabe({ ...eingabe, [f.feld]: e.target.value })} />
              <button className="n-tun" disabled={!(eingabe[f.feld] ?? '').trim()} onClick={() => onLink(f.feld, (eingabe[f.feld] ?? '').trim())}>Speichern</button>
            </span>
          ) : null)}
        </div>
      )}
    </div>
  )
}
