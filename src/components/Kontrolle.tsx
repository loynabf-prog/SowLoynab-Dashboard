// Das Kontroll-Sheet: Monat (oder "bis heute") waehlen, Checkliste sehen,
// Stempel setzen. Oeffnet sich aus der Kundenakte und aus dem Piloten.

import { useEffect, useState } from 'react'
import { X, Check, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useIdentity } from '../context/IdentityContext'
import { heute as heuteIso } from '../lib/datum'
import { kurzDatum, monatName, monatsEnde } from '../lib/pilot'
import { kontrollStand, stempelWahl, stempeln, type KontrollStand } from '../lib/kontrolle'

export default function KontrolleSheet({ clientId, kunde, monatsKey, onZu, onFertig }: {
  clientId: string
  kunde: string
  /** Vorauswahl (z. B. Vormonat aus dem Piloten) */
  monatsKey?: string
  onZu: () => void
  onFertig?: () => void
}) {
  const { toast } = useToast()
  const { memberId } = useIdentity()
  const heute = heuteIso()
  const [wahl, setWahl] = useState<{ key: string; bis: string; label: string }[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<{ key: string; bis: string } | null>(null)
  const [stand, setStand] = useState<KontrollStand | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    let weg = false
    ;(async () => {
      const vor = new Date(Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)
      const { data } = await supabase.from('monats_kontrollen').select('geprueft_bis').eq('client_id', clientId).eq('month_key', vor).maybeSingle()
      if (weg) return
      const w = stempelWahl(heute, (data as { geprueft_bis: string } | null)?.geprueft_bis ?? null)
      setWahl(w)
      setGewaehlt(w.find((x) => x.key === monatsKey) ?? w[w.length - 1])
    })()
    return () => { weg = true }
  }, [clientId, heute, monatsKey])

  useEffect(() => {
    if (!gewaehlt) return
    let weg = false
    setStand(null)
    kontrollStand(clientId, gewaehlt.key, gewaehlt.bis).then((s) => { if (!weg) setStand(s) })
    return () => { weg = true }
  }, [clientId, gewaehlt])

  const offen = stand ? stand.linksFehlen + stand.zahlenAlt + stand.ueberfaellig : 0
  const komplett = gewaehlt ? gewaehlt.bis === monatsEnde(gewaehlt.key) : false

  async function los() {
    if (!gewaehlt) return
    setLaeuft(true)
    const f = await stempeln(clientId, gewaehlt.key, gewaehlt.bis, memberId)
    setLaeuft(false)
    if (f) { toast('Konnte nicht stempeln: ' + f); return }
    toast(komplett ? `${monatName(gewaehlt.key)} abgeschlossen ✓` : `${kunde}: geprüft bis ${kurzDatum(gewaehlt.bis)}`)
    onFertig?.()
    onZu()
  }

  return (
    <div className="n-sheet-hinter" onClick={onZu}>
      <div className="n-sheet" role="dialog" aria-label="Kontrolle" onClick={(e) => e.stopPropagation()}>
        <div className="n-sheet-kopf">
          <strong>Kontrolle {kunde}</strong>
          <button className="n-sheet-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
        </div>
        <p className="n-sheet-text">Alles bis zum Stempel gilt als geprüft. Der Pilot erinnert dann nur noch an das, was danach kommt.</p>

        {wahl && wahl.length > 1 && (
          <div className="n-segment" role="tablist">
            {wahl.map((w) => (
              <button key={w.key} className={gewaehlt?.key === w.key ? 'on' : ''} onClick={() => setGewaehlt(w)}>{w.label}</button>
            ))}
          </div>
        )}

        {stand ? (
          <ul className="ko-liste">
            <li className="ok"><CheckCircle2 /> {stand.gepostetSeit} {stand.gepostetSeit === 1 ? 'Video' : 'Videos'} gepostet{stand.bisher ? ` seit ${kurzDatum(stand.bisher)}` : ''} · {stand.gepostetMonat} im Monat</li>
            <Zeile n={stand.ueberfaellig} gut="Alle geplanten Posts sind eingetragen" schlecht={`${stand.ueberfaellig} geplante Posts nicht als gepostet eingetragen`} />
            <Zeile n={stand.linksFehlen} gut="Alle Links da" schlecht={`${stand.linksFehlen} Videos ohne TikTok- oder Instagram-Link`} />
            <Zeile n={stand.zahlenAlt} gut="Zahlen frisch" schlecht={`${stand.zahlenAlt} Videos mit Zahlen älter als eine Woche`} />
          </ul>
        ) : <div className="n-leer">Prüfe …</div>}

        <button className={`n-tun ${offen ? '' : 'stark'} n-sheet-los`} disabled={!stand || laeuft} onClick={los}>
          <Check strokeWidth={2.6} /> {laeuft ? 'Stemple …' : offen ? `Trotzdem abschließen bis ${gewaehlt ? kurzDatum(gewaehlt.bis) : ''}` : komplett && gewaehlt ? `${monatName(gewaehlt.key)} abschließen` : `Geprüft bis ${gewaehlt ? kurzDatum(gewaehlt.bis) : ''}`}
        </button>
      </div>
    </div>
  )
}

function Zeile({ n, gut, schlecht }: { n: number; gut: string; schlecht: string }) {
  return n > 0
    ? <li className="warn"><AlertTriangle /> {schlecht}</li>
    : <li className="ok"><CheckCircle2 /> {gut}</li>
}
