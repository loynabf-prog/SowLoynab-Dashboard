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
import { Check, ChevronDown, ChevronUp, Lock, Plus } from 'lucide-react'
import LogoFrame from '../components/LogoFrame'
import { useToast } from '../context/ToastContext'
import {
  ladeMonatsDaten, monatsZeilen, monatsSumme, monatPlus, monatName, monatsKeyVon, istAbgeschlossen,
  speichereEintrag, entferneEintrag, monatSetzen, videoMonatSetzen, zuordnungsMonat, euro,
  type KundeFuerMonat, type MonatsEintrag, type MonatsVideo, type MonatsZeile, type MonatStatus,
} from '../lib/monate'

const VORHER = 3
const NACHHER = 8

const STAND_TEXT: Record<MonatsZeile['status'], string> = {
  vorschlag: 'Vorschlag', geplant: 'Geplant', fest: 'Fest', abgeschlossen: 'Abgeschlossen',
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
          const gesamt = s.summe.fest + s.summe.geplant + s.summe.vorschlag
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
        <div><strong>{euro(summe.fest + summe.geplant + summe.vorschlag)}</strong><span>Einnahmen</span></div>
        <div className={summe.fest ? 'gruen' : 'null'}><strong>{euro(summe.fest)}</strong><span>davon fest</span></div>
        <div><strong>{summe.videosGepostet}/{summe.videosSoll}</strong><span>Videos gepostet</span></div>
      </div>
      {(summe.geplant > 0 || summe.vorschlag > 0) && (
        <p className="p-fuss" style={{ marginTop: -8, marginBottom: 12 }}>
          {summe.geplant > 0 && `${euro(summe.geplant)} geplant`}
          {summe.geplant > 0 && summe.vorschlag > 0 && ' · '}
          {summe.vorschlag > 0 && `${euro(summe.vorschlag)} nur Vorschlag (Retainer, noch nicht eingetragen)`}
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

      <div className="n-gruppe">
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
            onNichtDabei={() => ausfuehren(speichereEintrag({ client_id: z.kunde.id, month_key: key, quota: 0, betrag: 0, status: 'fest', notiz: z.eintrag?.notiz ?? null }), `${z.kunde.name} ist im ${monatName(key, true)} nicht dabei`)}
            onZurueck={() => ausfuehren(entferneEintrag(z.kunde.id, key), 'Eintrag entfernt')}
            onVideoMonat={(v, m) => ausfuehren(videoMonatSetzen(v.id, m), m ? `Zählt jetzt für ${monatName(m)}` : 'Zählt wieder nach Posting-Tag')}
          />
        ))}
      </div>

      {!zu && (
        <div className="n-abschnitt" style={{ marginTop: 14 }}>
          <button className="n-mehr-link" style={{ marginLeft: 0 }} onClick={() => setDazuOffen((x) => !x)}>
            <Plus strokeWidth={2.6} style={{ width: 15, height: 15, verticalAlign: -2 }} /> Kunde dazunehmen
          </button>
        </div>
      )}
      {dazuOffen && !zu && (
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

      {nichtDabei.length > 0 && (
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
  onSpeichern: (e: { quota: number; betrag: number | null; status: MonatStatus; notiz: string | null }) => void
  onNichtDabei: () => void
  onZurueck: () => void
  onVideoMonat: (v: MonatsVideo, m: string | null) => void
}) {
  const [quota, setQuota] = useState(String(z.soll))
  const [betrag, setBetrag] = useState(String(z.betrag || ''))
  const [status, setStatus] = useState<MonatStatus>(z.status === 'fest' ? 'fest' : 'geplant')
  const [notiz, setNotiz] = useState(z.eintrag?.notiz ?? '')
  useEffect(() => {
    setQuota(String(z.soll)); setBetrag(String(z.betrag || ''))
    setStatus(z.status === 'fest' ? 'fest' : 'geplant'); setNotiz(z.eintrag?.notiz ?? '')
  }, [z.soll, z.betrag, z.status, z.eintrag?.notiz])

  const offenVideos = z.videos.length - z.gepostet
  const fehlt = Math.max(0, z.soll - z.videos.length)
  const unter = [
    `${z.gepostet}/${z.soll} gepostet`,
    offenVideos > 0 ? `${offenVideos} offen` : null,
    fehlt > 0 ? `${fehlt} noch nicht angelegt` : null,
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
                <button className={status === 'fest' ? 'on' : ''} onClick={() => setStatus('fest')}>Steht fest</button>
              </div>
              <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz, z. B. 1 Video schon im Oktober gepostet" />
              <div className="m-knoepfe">
                <button className="n-tun stark" onClick={() => onSpeichern({
                  quota: Math.max(0, Math.round(Number(quota) || 0)),
                  betrag: betrag.trim() === '' ? null : Math.max(0, Number(betrag.replace(',', '.')) || 0),
                  status, notiz: notiz.trim() || null,
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
