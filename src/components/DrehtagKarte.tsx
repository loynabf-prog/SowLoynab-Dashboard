// Drehtag in der Kundenakte: Rohmaterial hochladen, Drehtag abschliessen,
// und sehen, wo die Videos in der Kette stehen.
//
//   1. "Rohmaterial hochladen" oeffnet 1 Briefkasten/<Kunde> in Dropbox
//   2. Clips aus den Kamera-Uploads dort hineinschieben
//   3. "Drehtag abschliessen" -> Auftrag; die Automatik sortiert und schneidet,
//      Fassie gibt jedes Video unter Produktion frei (oder laesst aendern),
//      Servieren legt die beste Datei nach 3 Zum Posten, der Arbeitsordner geht ins Archiv

import { useCallback, useEffect, useState } from 'react'
import { Check, Clapperboard, ExternalLink, Loader2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dropbox, dropboxWebLink } from '../lib/medien'
import { drehtagAbschliessen, eingangVon, istVideo, ladeAuftraege, statusText, type Auftrag } from '../lib/produktion'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { automatikAnstossen } from '../lib/automatik'

interface Stufen { roh: number; pruefung: number; feinschliff: number; fertig: number }

export default function DrehtagKarte({ clientId, clientName, ordner }: { clientId: string; clientName: string; ordner: string[] }) {
  const { memberId } = useIdentity()
  const { byId } = useTeam()
  const { toast } = useToast()
  const [wahl, setWahl] = useState(0)
  const [clips, setClips] = useState<number | null>(null)
  const [eingangFehler, setEingangFehler] = useState<string | null>(null)
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [stufen, setStufen] = useState<Stufen>({ roh: 0, pruefung: 0, feinschliff: 0, fertig: 0 })
  const [busy, setBusy] = useState(false)

  const ordnerJetzt = ordner[wahl] ?? ordner[0]
  const eingang = eingangVon(ordnerJetzt)
  const offen = auftraege.find((a) => a.status === 'wartet' || a.status === 'laeuft')

  const zaehleEingang = useCallback(async () => {
    try {
      const liste = await dropbox.liste(eingang)
      setClips(liste.filter((e) => !e.ordner && istVideo(e.name)).length)
      setEingangFehler(null)
    } catch (e) {
      setClips(null)
      setEingangFehler((e as Error).message)
    }
  }, [eingang])

  const laden = useCallback(async () => {
    try { setAuftraege(await ladeAuftraege(clientId)) } catch { /* Tabelle fehlt -> Karte bleibt schlicht */ }
    const { data } = await supabase.from('videos').select('produktion_stufe')
      .eq('client_id', clientId).is('deleted_at', null).neq('status', 'posted').not('produktion_stufe', 'is', null)
    const s: Stufen = { roh: 0, pruefung: 0, feinschliff: 0, fertig: 0 }
    for (const v of (data ?? []) as { produktion_stufe: keyof Stufen }[]) s[v.produktion_stufe]++
    setStufen(s)
  }, [clientId])

  useEffect(() => { zaehleEingang() }, [zaehleEingang])
  useEffect(() => { laden() }, [laden])

  // Fortschritt der Automatik live mitlesen
  useEffect(() => {
    const ch = supabase
      .channel(`auftraege-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produktion_auftraege', filter: `client_id=eq.${clientId}` }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [clientId, laden])

  // Zurueck aus Dropbox -> neu zaehlen
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') zaehleEingang() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [zaehleEingang])

  async function abschliessen() {
    if (!clips) return
    setBusy(true)
    try {
      await drehtagAbschliessen({ clientId, ordner: ordnerJetzt, dateien: clips, memberId })
      void automatikAnstossen(`Drehtag abgeschlossen: ${clientName} (${clips} Clips)`)
      // Im Team-Chat Bescheid geben -- dort sieht Lion auch spaeter seinen Feinschliff
      const { data: team } = await supabase.from('chat_channels').select('id').eq('kind', 'team').is('deleted_at', null).limit(1)
      const kanal = (team ?? [])[0] as { id: string } | undefined
      if (kanal) {
        const wer = memberId ? byId(memberId)?.name ?? 'Jemand' : 'Jemand'
        await supabase.from('chat_messages').insert({
          channel_id: kanal.id, author_kind: 'system',
          body: `🎬 ${wer} hat den Drehtag bei ${clientName} abgeschlossen – ${clips} Clips im Eingang. Die Automatik startet und schneidet.`,
        })
      }
      toast('Drehtag abgeschlossen – die Automatik übernimmt')
      laden()
    } catch (e) {
      toast('Ging nicht: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dt-karte">
      <div className="dt-kopf">
        <Clapperboard size={18} />
        <strong>Drehtag</strong>
        {ordner.length > 1 && (
          <div className="ch-chips dt-wahl">
            {ordner.map((o, i) => (
              <button key={o} type="button" className={i === wahl ? 'on' : ''} onClick={() => setWahl(i)}>{o.split('/').pop()}</button>
            ))}
          </div>
        )}
      </div>

      <div className="dt-knoepfe">
        <a className="btn btn-sm" href={dropboxWebLink(eingang)} target="_blank" rel="noopener noreferrer">
          <Upload size={15} /> Rohmaterial hochladen
        </a>
        <button className="btn btn-sm btn-primary" onClick={abschliessen} disabled={busy || !clips || !!offen}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
          {' '}Drehtag abschließen{clips ? ` (${clips} Clips)` : ''}
        </button>
      </div>
      <div className="dt-hinweis">
        {eingangFehler
          ? `Eingang nicht lesbar: ${eingangFehler}`
          : clips === null ? 'Prüfe den Eingang …'
            : clips === 0 ? 'Eingang ist leer. Nach dem Dreh die Clips aus den Kamera-Uploads in den Eingang schieben.'
              : offen ? 'Ein Drehtag ist schon in Arbeit – neue Clips kommen mit dem nächsten Abschluss dran.'
                : `${clips} Clips im Eingang – bereit.`}
        {' '}
        <a href={dropboxWebLink(ordnerJetzt)} target="_blank" rel="noopener noreferrer" className="dt-link">Ordner <ExternalLink size={11} /></a>
      </div>

      {(stufen.roh + stufen.pruefung + stufen.feinschliff + stufen.fertig > 0) && (
        <div className="dt-stufen">
          <span><b>{stufen.roh}</b> sortiert</span>
          <span><b>{stufen.pruefung}</b> zur Freigabe</span>
          <span><b>{stufen.feinschliff}</b> im Feinschliff</span>
          <span><b>{stufen.fertig}</b> fertig</span>
        </div>
      )}

      {auftraege.length > 0 && (
        <ul className="dt-liste">
          {auftraege.slice(0, 3).map((a) => (
            <li key={a.id} className={a.status}>
              <span className="dt-datum">{new Date(a.drehtag + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
              <span>{statusText(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
