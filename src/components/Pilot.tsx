// Pilot-Bausteine: die Empfehlungsliste mit dem einen Knopf, der Monatsbalken
// je Kunde, und der Hook, der beides laedt. Genutzt auf Heute (Top 3), auf
// /pilot (alles) und in der Kundenakte (nur dieser Kunde).

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, CalendarClock, Camera, Lightbulb, Flame, FileText, Link2, PauseCircle,
  RefreshCw, Sparkles, TrendingDown, X, Check, ChevronRight, type LucideIcon,
} from 'lucide-react'
import LogoFrame from './LogoFrame'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { heute as heuteIso, datumPlus } from '../lib/datum'
import { kurzDatum, type Empfehlung, type KundenLage, type Pilot } from '../lib/pilot'
import { drehtagAnlegen, einplanen, ladePilot, mehrDavon } from '../lib/pilotAktionen'
import { supabase } from '../lib/supabase'
import '../styles/pilot.css'

export const SYMBOL: Record<Empfehlung['art'], { icon: LucideIcon; farbe: string }> = {
  raus: { icon: Eye, farbe: 'glut' },
  rueckstand: { icon: TrendingDown, farbe: 'rot' },
  einplanen: { icon: CalendarClock, farbe: 'gelb' },
  drehtag: { icon: Camera, farbe: 'lila' },
  drehtag_klein: { icon: Camera, farbe: 'gelb' },
  ideen: { icon: Lightbulb, farbe: 'gelb' },
  ofen: { icon: Flame, farbe: 'glut' },
  vertrag: { icon: FileText, farbe: 'gelb' },
  abrechnung: { icon: FileText, farbe: 'gelb' },
  erfolg: { icon: Sparkles, farbe: 'blau' },
  links: { icon: Link2, farbe: 'blau' },
  pause: { icon: PauseCircle, farbe: 'grau' },
  zahlen: { icon: RefreshCw, farbe: 'blau' },
}

/** Laedt den Piloten und hoert auf Aenderungen. */
export function usePilot(): { pilot: Pilot | null; fehler: string | null; neu: () => void } {
  const [pilot, setPilot] = useState<Pilot | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const laden = useCallback(async () => {
    const p = await ladePilot()
    setFehler(p.fehler)
    setPilot({ lagen: p.lagen, empfehlungen: p.empfehlungen })
  }, [])
  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const neu = () => laden()
    window.addEventListener('daten-geaendert', neu)
    return () => window.removeEventListener('daten-geaendert', neu)
  }, [laden])
  return { pilot, fehler, neu: laden }
}

/** Der Monatsbalken: gepostet gegen Ziel, mit Soll-Marke "heute". */
export function LageBalken({ l, klein }: { l: KundenLage; klein?: boolean }) {
  const ziel = Math.max(1, l.kunde.ziel)
  const ist = Math.min(1, l.kunde.gepostet / ziel)
  const soll = Math.min(1, l.soll / ziel)
  return (
    <div className={`pl-balken ${l.ampel} ${klein ? 'klein' : ''}`} role="img" aria-label={l.satz}>
      <div className="pl-balken-ist" style={{ width: `${ist * 100}%` }} />
      {l.kunde.ziel > 0 && !l.pausiert && <div className="pl-balken-soll" style={{ left: `${soll * 100}%` }} title={`Soll heute: ${l.soll}`} />}
    </div>
  )
}

/** Die Pizza-Stufen eines Kunden als kleine Zaehler. */
export function Stufen({ k }: { k: KundenLage['kunde'] }) {
  const teile: [string, number][] = [
    ['Teig', k.teig + k.ideen], ['Belegt', k.belegt], ['Ofen', k.im_ofen + k.zettel], ['Raus', k.raus], ['Teller', k.eingeplant + k.fertig_ohne_termin],
  ]
  return (
    <div className="pl-stufen">
      {teile.map(([name, z]) => (
        <span key={name} className={z > 0 ? 'da' : ''}><b>{z}</b>{name}</span>
      ))}
    </div>
  )
}

interface ListeProps {
  liste: Empfehlung[]
  /** Nach einer Aktion neu laden. */
  onNeu: () => void
  /** Kundennamen ausblenden (in der Kundenakte). */
  ohneKunde?: boolean
  /** Nur Titel und Kunde, kein Warum (Heute). */
  kompakt?: boolean
  leer?: ReactNode
}

/** Die Empfehlungen als Zeilen mit dem einen Knopf. */
export function PilotListe({ liste, onNeu, ohneKunde, kompakt, leer }: ListeProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { memberId } = useIdentity()
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [dreh, setDreh] = useState<Empfehlung | null>(null)
  const [erledigt, setErledigt] = useState<string[]>([])

  async function tun(e: Empfehlung) {
    if (laeuft) return
    if (e.art === 'einplanen' || (e.art === 'rueckstand' && e.aktion === 'Einplanen')) {
      if (!e.clientId) return
      setLaeuft(e.key)
      const r = await einplanen(e.clientId)
      setLaeuft(null)
      if (r.fehler) { toast('Konnte nicht einplanen: ' + r.fehler); return }
      if (r.anzahl === 0) { toast('Nichts einzuplanen'); onNeu(); return }
      toast(`${r.anzahl} ${r.anzahl === 1 ? 'Video' : 'Videos'} eingeplant · ${r.tage.map(kurzDatum).join(', ')} um ${r.zeit}`)
      setErledigt((x) => [...x, e.key])
      onNeu()
      return
    }
    if (e.art === 'drehtag' || (e.art === 'rueckstand' && e.aktion === 'Drehtag planen')) { setDreh(e); return }
    if (e.art === 'erfolg' && e.videoId && e.clientId) {
      setLaeuft(e.key)
      const f = await mehrDavon({ client_id: e.clientId, video_id: e.videoId, title: e.titel.replace(/^„(.*)“ läuft.*$/, '$1'), faktor: e.zahl ?? 2 }, user?.id)
      setLaeuft(null)
      if (f) { toast('Konnte Idee nicht anlegen: ' + f); return }
      toast('Idee angelegt: Mehr davon')
      setErledigt((x) => [...x, e.key])
      onNeu()
      return
    }
    if (e.art === 'zahlen' && e.clientId) {
      setLaeuft(e.key)
      const { data } = await supabase.from('videos').select('id').eq('client_id', e.clientId).eq('status', 'posted').is('deleted_at', null)
        .gte('posted_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
        .or('stats_updated_at.is.null,stats_updated_at.lt.' + new Date(Date.now() - 7 * 86_400_000).toISOString())
      const ids = ((data ?? []) as { id: string }[]).map((v) => v.id)
      try {
        if (ids.length) await supabase.functions.invoke('refresh-stats', { body: { video_ids: ids } })
      } catch (x) {
        setLaeuft(null)
        toast('Zahlen holen hat nicht geklappt: ' + (x as Error).message)
        return
      }
      setLaeuft(null)
      toast(`Zahlen von ${ids.length} Videos geholt`)
      setErledigt((x) => [...x, e.key])
      return
    }
    navigate(e.ziel)
  }

  async function drehtag(datum: string) {
    if (!dreh?.clientId || !dreh.kunde) return
    const anzahl = Math.max(1, dreh.zahl ?? 1)
    const f = await drehtagAnlegen({ clientId: dreh.clientId, kunde: dreh.kunde, datum, anzahl, userId: user?.id })
    if (f) { toast('Konnte Drehtag nicht anlegen: ' + f); return }
    toast(`Drehtag am ${kurzDatum(datum)} · ${anzahl} Videos`)
    setErledigt((x) => [...x, dreh.key])
    setDreh(null)
    onNeu()
  }

  const sichtbar = liste.filter((e) => !erledigt.includes(e.key))
  if (sichtbar.length === 0) return <>{leer ?? null}</>

  return (
    <>
      <div className="n-gruppe pl-liste">
        {sichtbar.map((e) => {
          const s = SYMBOL[e.art]
          const I = s.icon
          const mein = !e.besitzer || e.besitzer === memberId
          return (
            <div key={e.key} className={`n-zeile pl-zeile ${e.ampel}`}>
              {e.kunde && !ohneKunde ? (
                <button className="z-logo z-logo-knopf" onClick={() => navigate(e.clientId ? `/client/${e.clientId}` : e.ziel)} aria-label={`${e.kunde} öffnen`}>
                  <LogoFrame name={e.kunde} logoUrl={e.logo} className="a-logo" />
                  <span className={`z-logo-punkt ${s.farbe}`}><I strokeWidth={2.6} /></span>
                </button>
              ) : <span className={`n-ic ${s.farbe}`}><I strokeWidth={2.2} /></span>}
              <button className="n-zeile-klick" onClick={() => navigate(e.ziel)}>
                <span className="n-text">
                  <span className="n-titel pl-titel">{e.titel}</span>
                  <span className="n-unter pl-warum">
                    {[!ohneKunde && e.kunde, kompakt ? null : e.warum, !mein && e.besitzer ? 'anderer Ofen' : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              <button className={`n-tun ${e.ampel === 'rot' || e.ampel === 'gelb' ? 'stark' : ''}`} disabled={laeuft === e.key} onClick={() => tun(e)}>
                {laeuft === e.key ? '…' : e.aktion}
              </button>
            </div>
          )
        })}
      </div>
      {dreh && <DrehtagSheet e={dreh} onZu={() => setDreh(null)} onLos={drehtag} />}
    </>
  )
}

function DrehtagSheet({ e, onZu, onLos }: { e: Empfehlung; onZu: () => void; onLos: (d: string) => Promise<void> }) {
  const heute = heuteIso()
  const [datum, setDatum] = useState(datumPlus(heute, 3))
  const [laeuft, setLaeuft] = useState(false)
  const n = Math.max(1, e.zahl ?? 1)
  return (
    <div className="n-sheet-hinter" onClick={onZu}>
      <div className="n-sheet" role="dialog" aria-label="Drehtag planen" onClick={(x) => x.stopPropagation()}>
        <div className="n-sheet-kopf">
          <strong>Drehtag {e.kunde}</strong>
          <button className="n-sheet-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
        </div>
        <p className="n-sheet-text">{n} {n === 1 ? 'Video' : 'Videos'} an einem Tag drehen — dann reicht der Vorrat für die nächsten 30 Tage. Die ungedrehten Ideen hängt der Pilot an den Drehtag.</p>
        <input className="n-sheet-datum" type="date" value={datum} min={heute} onChange={(x) => setDatum(x.target.value)} />
        <button className="n-tun stark n-sheet-los" disabled={!datum || laeuft} onClick={async () => { setLaeuft(true); await onLos(datum); setLaeuft(false) }}>
          <Check strokeWidth={2.6} /> {laeuft ? 'Lege an …' : 'Drehtag anlegen'}
        </button>
      </div>
    </div>
  )
}

/** Eine Kundenzeile auf /pilot: Logo, Name, Satz, Balken, Stufen. */
export function KundenZeile({ l }: { l: KundenLage }) {
  const navigate = useNavigate()
  const k = l.kunde
  return (
    <button className={`pl-kunde ${l.ampel}`} onClick={() => navigate(`/client/${k.client_id}`)}>
      <LogoFrame name={k.name} logoUrl={k.logo_url} className="a-logo" />
      <span className="pl-kunde-text">
        <span className="pl-kunde-kopf">
          <strong>{k.name}</strong>
          {k.ziel > 0 && !l.pausiert && <span className={`pl-prognose ${l.ampel}`}>{l.prognose} von {k.ziel}</span>}
        </span>
        <LageBalken l={l} />
        <span className="pl-satz">{l.satz}</span>
        <Stufen k={k} />
      </span>
      <ChevronRight className="n-chevron" />
    </button>
  )
}
