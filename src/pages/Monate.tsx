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
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, Check, ChevronDown, ChevronUp, CircleDollarSign, Clapperboard, HelpCircle, ListChecks, Lock, Plus } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { useToast } from '../context/ToastContext'
import {
  ladeMonatsDaten, monatsZeilen, monatsSumme, monatPlus, monatName, monatsKeyVon, istAbgeschlossen,
  speichereEintrag, entferneEintrag, monatSetzen, videoMonatSetzen, zuordnungsMonat, euro,
  monatsTodos, monatsKalender, drehtagEintragen,
  type KundeFuerMonat, type MonatsEintrag, type MonatsVideo, type MonatsZeile, type MonatStatus,
  type MonatsDrehtag, type MonatsAufgabe, type MonatsTodo, type Zahlstatus,
} from '../lib/monate'

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

  const [kunden, setKunden] = useState<KundeFuerMonat[]>([])
  const [eintraege, setEintraege] = useState<MonatsEintrag[]>([])
  const [videos, setVideos] = useState<MonatsVideo[]>([])
  const [drehtage, setDrehtage] = useState<MonatsDrehtag[]>([])
  const [aufgaben, setAufgaben] = useState<MonatsAufgabe[]>([])
  const [ansicht, setAnsicht] = useState<'kunden' | 'kalender' | 'todos'>('kunden')
  const [tagOffen, setTagOffen] = useState<string | null>(null)
  const [drehFuer, setDrehFuer] = useState<string>('')
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [dazuOffen, setDazuOffen] = useState(false)
  const streifen = useRef<HTMLDivElement>(null)
  // Gewaehlten Monat in die Mitte des Streifens holen
  useEffect(() => {
    const el = streifen.current?.querySelector<HTMLElement>('.m-monat.on')
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
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
    for (let i = -VORHER; i <= NACHHER; i++) l.push(monatPlus(heuteKey, i))
    if (!l.includes(key)) l.push(key)
    return l.sort()
  }, [heuteKey, key])

  const proMonat = useMemo(() => new Map(monate.map((m) => {
    const z = monatsZeilen(m, heuteKey, kunden, eintraege, videos)
    return [m, { summe: monatsSumme(z), zu: istAbgeschlossen(eintraege, m) }]
  })), [monate, heuteKey, kunden, eintraege, videos])

  const zeilen = useMemo(() => monatsZeilen(key, heuteKey, kunden, eintraege, videos), [key, heuteKey, kunden, eintraege, videos])
  const dabei = zeilen.filter((z) => !z.nichtDabei)
  const nichtDabei = zeilen.filter((z) => z.nichtDabei)
  const summe = monatsSumme(zeilen)
  const todos = useMemo(() => monatsTodos(key, zeilen, drehtage, aufgaben), [key, zeilen, drehtage, aufgaben])
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
      <div className="h-datum">{laedt ? 'Lade …' : 'Kunden, Videos und Einnahmen je Monat'}</div>
      <h1 className="h-gruss">Monate</h1>
      {fehler && <div className="n-gruppe"><div className="n-leer">Konnte nicht laden: {fehler}</div></div>}

      {/* Streifen */}
      <div className="m-streifen" role="tablist" aria-label="Monat" ref={streifen}>
        {monate.map((m) => {
          const s = proMonat.get(m)!
          const gesamt = s.summe.fest + s.summe.geplant + s.summe.unsicher + s.summe.vorschlag
          return (
            <button key={m} role="tab" aria-selected={m === key}
              className={`m-monat ${m === key ? 'on' : ''} ${m === heuteKey ? 'jetzt' : ''} ${m < heuteKey ? 'vorbei' : ''}`}
              onClick={() => waehle(m)}>
              <span className="m-name">{monatName(m, true)}{s.zu && <Lock />}</span>
              <strong>{gesamt ? euro(gesamt) : '–'}</strong>
              <small>{s.summe.videosSoll ? `${s.summe.videosSoll} Videos` : 'leer'}</small>
            </button>
          )
        })}
      </div>

      <div className="n-abschnitt">
        <h2>{monatName(key)}</h2>
        <span>{zu ? 'abgeschlossen' : key === heuteKey ? 'laufender Monat' : key < heuteKey ? 'vorbei' : 'kommt'}</span>
      </div>

      <div className="p-lage">
        <div><strong>{euro(summe.fest + summe.geplant + summe.unsicher + summe.vorschlag)}</strong><span>Einnahmen</span></div>
        <div className={summe.fest ? 'gruen' : 'null'}><strong>{euro(summe.fest)}</strong><span>davon fest</span></div>
        <div><strong>{summe.videosGepostet}/{summe.videosSoll}</strong><span>Videos gepostet</span></div>
      </div>
      <div className="p-lage">
        <div className={summe.bezahlt ? 'gruen' : 'null'}><strong>{euro(summe.bezahlt)}</strong><span>schon bezahlt</span></div>
        <div className={summe.rechnung ? 'gelb' : 'null'}><strong>{euro(summe.rechnung)}</strong><span>Rechnung raus</span></div>
        <div><strong>{euro(Math.max(0, summe.fest + summe.geplant + summe.unsicher + summe.vorschlag - summe.bezahlt - summe.rechnung))}</strong><span>noch offen</span></div>
      </div>
      {(summe.geplant > 0 || summe.unsicher > 0 || summe.vorschlag > 0) && (
        <p className="p-fuss" style={{ marginTop: -8, marginBottom: 12 }}>
          {[
            summe.geplant > 0 ? `${euro(summe.geplant)} geplant` : null,
            summe.unsicher > 0 ? `${euro(summe.unsicher)} unsicher` : null,
            summe.vorschlag > 0 ? `${euro(summe.vorschlag)} nur Vorschlag (Retainer, noch nicht eingetragen)` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

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

      <div className="n-segment" role="tablist" aria-label="Ansicht">
        <button className={ansicht === 'kunden' ? 'on' : ''} onClick={() => setAnsicht('kunden')}>Kunden <small>{dabei.length}</small></button>
        <button className={ansicht === 'kalender' ? 'on' : ''} onClick={() => setAnsicht('kalender')}>Kalender <small>{postsImMonat}</small></button>
        <button className={ansicht === 'todos' ? 'on' : ''} onClick={() => setAnsicht('todos')}>To-dos <small>{todos.length}</small></button>
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
        {dabei.length === 0 ? (
          <div className="n-leer">{laedt ? 'Lade …' : 'Noch kein Kunde in diesem Monat.'}</div>
        ) : dabei.map((z) => (
          <KundenZeile
            key={z.kunde.id}
            z={z}
            monat={key}
            gesperrt={zu}
            offen={offen === z.kunde.id}
            onToggle={() => setOffen(offen === z.kunde.id ? null : z.kunde.id)}
            onKunde={() => navigate(`/client/${z.kunde.id}`)}
            onSpeichern={(e) => ausfuehren(speichereEintrag({ client_id: z.kunde.id, month_key: key, ...e }), 'Gespeichert')}
            onNichtDabei={() => ausfuehren(speichereEintrag({ client_id: z.kunde.id, month_key: key, quota: 0, betrag: 0, status: 'fest', notiz: z.eintrag?.notiz ?? null, dabei: false }), `${z.kunde.name} ist im ${monatName(key, true)} nicht dabei`)}
            onZurueck={() => ausfuehren(entferneEintrag(z.kunde.id, key), 'Eintrag entfernt')}
            onVideoMonat={(v, m) => ausfuehren(videoMonatSetzen(v.id, m), m ? `Zählt jetzt für ${monatName(m)}` : 'Zählt wieder nach Posting-Tag')}
          />
        ))}
      </div>}

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

      <p className="p-fuss">
        Ohne Eintrag schlägt die App für diesen und kommende Monate den Retainer vor. Vergangene Monate zählen nur,
        was eingetragen ist. Ein Video zählt zu dem Monat seines Posting-Tags – außer du rechnest es einem anderen zu.
      </p>
    </>
  )
}

function KundenZeile({
  z, monat, gesperrt, offen, onToggle, onKunde, onSpeichern, onNichtDabei, onZurueck, onVideoMonat,
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
  onVideoMonat: (v: MonatsVideo, m: string | null) => void
}) {
  const [quota, setQuota] = useState(String(z.soll))
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

  const offenVideos = z.videos.length - z.gepostet
  const fehlt = Math.max(0, z.soll - z.videos.length)
  const unter = [
    `${z.gepostet}/${z.soll} gepostet`,
    offenVideos > 0 ? `${offenVideos} offen` : null,
    fehlt > 0 ? `${fehlt} noch nicht angelegt` : null,
    z.eintrag?.zahlung_monat && z.eintrag.zahlung_monat !== monat ? `Geld erst im ${monatName(z.eintrag.zahlung_monat, true)}` : null,
    z.kunde.pausiert_seit ? 'pausiert' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <button className="n-zeile" onClick={onToggle} aria-expanded={offen}>
        <LogoFrame name={z.kunde.name} logoUrl={z.kunde.logo_url} className="a-logo" />
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
                <label>Videos<input type="number" min={0} inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value)} /></label>
                <label>Betrag (€, netto)<input type="number" min={0} step="1" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0" /></label>
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
              <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz, z. B. 1 Video schon im Oktober gepostet" />
              <div className="m-knoepfe">
                <button className="n-tun stark" onClick={() => onSpeichern({
                  quota: Math.max(0, Math.round(Number(quota) || 0)),
                  betrag: betrag.trim() === '' ? null : Math.max(0, Number(betrag.replace(',', '.')) || 0),
                  status, notiz: notiz.trim() || null, zahlung_monat: zahlung || null, zahlstatus,
                })}>Speichern</button>
                <button className="n-tun" onClick={onNichtDabei}>Nicht dabei</button>
                {z.herkunft === 'eintrag' && <button className="z-link" onClick={onZurueck}>Eintrag entfernen</button>}
                <button className="z-link" onClick={onKunde}>Kundenakte</button>
              </div>
            </>
          )}
          {gesperrt && z.eintrag?.notiz && <p className="p-fuss" style={{ margin: 0 }}>{z.eintrag.notiz}</p>}

          <div>
            <div className="z-label">Videos in diesem Monat ({z.videos.length})</div>
            {z.videos.length === 0 ? <p className="p-fuss" style={{ margin: 0 }}>Noch keine angelegt.</p> : (
              <div className="m-videos">
                {z.videos.map((v) => {
                  const natuerlich = v.scheduled_date?.slice(0, 7) ?? v.posted_at?.slice(0, 7) ?? null
                  const jetzt = zuordnungsMonat(v)!
                  const wahl = [monatPlus(monat, -1), monat, monatPlus(monat, 1)]
                  return (
                    <div key={v.id} className="m-video">
                      <span className={`m-punkt ${v.status === 'posted' ? 'gruen' : ''}`} />
                      <span className="m-vtitel">
                        {v.title || 'Video'}
                        <small>{v.scheduled_date ? new Date(v.scheduled_date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : 'ohne Termin'}{v.status === 'posted' ? ' · gepostet' : ''}{v.abrechnungsmonat ? ' · umgebucht' : ''}</small>
                      </span>
                      {!gesperrt && (
                        <select
                          aria-label="Zählt für Monat"
                          value={jetzt}
                          onChange={(e) => onVideoMonat(v, e.target.value === natuerlich ? null : e.target.value)}
                        >
                          {wahl.map((m) => <option key={m} value={m}>zählt: {monatName(m, true)}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
