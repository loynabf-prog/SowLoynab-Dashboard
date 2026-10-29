// Pilot-Bausteine: die Empfehlungsliste mit dem einen Knopf, der Monatsbalken
// je Kunde, und der Hook, der beides laedt. Genutzt auf Heute (Top 3), auf
// /pilot (alles) und in der Kundenakte (nur dieser Kunde).

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, CalendarClock, Camera, Lightbulb, Flame, FileText, Link2, PauseCircle,
  RefreshCw, Sparkles, TrendingDown, ChevronRight, ClipboardCheck, type LucideIcon,
} from 'lucide-react'
import KontrolleSheet from './Kontrolle'
import LogoFrame from './LogoFrame'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useIdentity } from '../context/IdentityContext'
import { kurzDatum, monatName, type Empfehlung, type KundenLage, type Pilot } from '../lib/pilot'
import { einplanen, ladePilot, mehrDavon } from '../lib/pilotAktionen'
import { supabase } from '../lib/supabase'
import '../styles/pilot.css'

export const SYMBOL: Record<Empfehlung['art'], { icon: LucideIcon; farbe: string }> = {
  raus: { icon: Eye, farbe: 'glut' },
  rueckstand: { icon: TrendingDown, farbe: 'rot' },
  einplanen: { icon: CalendarClock, farbe: 'gelb' },
  vorrat: { icon: Camera, farbe: 'lila' },
  ideen: { icon: Lightbulb, farbe: 'gelb' },
  ofen: { icon: Flame, farbe: 'glut' },
  vertrag: { icon: FileText, farbe: 'gelb' },
  abrechnung: { icon: FileText, farbe: 'gelb' },
  erfolg: { icon: Sparkles, farbe: 'blau' },
  links: { icon: Link2, farbe: 'blau' },
  pause: { icon: PauseCircle, farbe: 'grau' },
  zahlen: { icon: RefreshCw, farbe: 'blau' },
  kontrolle: { icon: ClipboardCheck, farbe: 'gruen' },
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
  const [kontrolle, setKontrolle] = useState<Empfehlung | null>(null)
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
    if (e.art === 'kontrolle' && e.clientId) { setKontrolle(e); return }
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
      {kontrolle && kontrolle.clientId && (
        <KontrolleSheet clientId={kontrolle.clientId} kunde={kontrolle.kunde ?? ''} monatsKey={kontrolle.monatsKey}
          onZu={() => setKontrolle(null)} onFertig={() => { setErledigt((x) => [...x, kontrolle.key]); onNeu() }} />
      )}
    </>
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
          {l.gruen ? <span className="pl-prognose gruen">✓ {monatName(k.monat)}</span>
            : k.ziel > 0 && !l.pausiert && <span className={`pl-prognose ${l.ampel}`}>{l.prognose} von {k.ziel}</span>}
        </span>
        <LageBalken l={l} />
        <span className="pl-satz">{l.satz}</span>
        <Stufen k={k} />
      </span>
      <ChevronRight className="n-chevron" />
    </button>
  )
}
