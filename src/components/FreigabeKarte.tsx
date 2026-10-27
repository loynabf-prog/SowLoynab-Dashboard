// Zur Freigabe: geschnittene Videos, die Fassie anschaut, bevor Lion sie bekommt.
//
//   Vorschau ansehen -> "Freigeben" (geht sofort zu Lion)
//                    -> "Ändern" (Wunsch reiht sich ein, Claude arbeitet die
//                       Wünsche nacheinander ab und meldet sich mit neuer Vorschau)
//
// Während ein Wunsch unterwegs ist, kann man schon das nächste Video ansehen.

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dropbox } from '../lib/medien'
import { aendern, freigeben, ladeFreigaben, offeneRunde, platzInSchlange, vorschauPfad, type Aenderung, type PruefVideo } from '../lib/freigabe'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { automatikAnstossen } from '../lib/automatik'

export default function FreigabeKarte() {
  const { memberId } = useIdentity()
  const { members } = useTeam()
  const { toast } = useToast()
  const [videos, setVideos] = useState<PruefVideo[]>([])
  const [aenderungen, setAenderungen] = useState<Aenderung[]>([])
  const [offen, setOffen] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [wunschFuer, setWunschFuer] = useState<string | null>(null)
  const [wunsch, setWunsch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const lionId = members.find((m) => /^lion/i.test(m.name))?.id ?? null

  const laden = useCallback(async () => {
    try {
      const r = await ladeFreigaben()
      setVideos(r.videos)
      setAenderungen(r.aenderungen)
    } catch { /* Tabelle fehlt -> Karte bleibt weg */ }
  }, [])

  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const ch = supabase
      .channel('freigabe')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, () => laden())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  async function ansehen(v: PruefVideo) {
    if (offen === v.id) { setOffen(null); return }
    setOffen(v.id)
    if (!v.dropbox_pfad) return
    try {
      const url = await dropbox.link(vorschauPfad(v.dropbox_pfad))
      setLinks((l) => ({ ...l, [v.id]: url }))
    } catch (e) {
      toast('Vorschau nicht gefunden: ' + (e as Error).message)
    }
  }

  async function los(v: PruefVideo) {
    setBusy(v.id)
    try {
      await freigeben(v, memberId, lionId)
      toast(`Freigegeben – ${v.title} liegt jetzt bei Lion`)
      setOffen(null)
      laden()
    } catch (e) {
      toast('Ging nicht: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function schicken(v: PruefVideo) {
    setBusy(v.id)
    try {
      await aendern(v, wunsch, memberId)
      void automatikAnstossen(`Änderung: ${v.title} (${v.clients?.name ?? 'Kunde'})`)
      toast('Eingereiht – Claude meldet sich mit neuer Vorschau')
      setWunsch('')
      setWunschFuer(null)
      laden()
    } catch (e) {
      toast('Ging nicht: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (videos.length === 0) return null

  return (
    <div className="fg-karte">
      <div className="fg-kopf">
        <strong>Freigabe <span className="fg-zahl">{videos.length}</span></strong>
        <span>{videos.length} {videos.length === 1 ? 'Video wartet' : 'Videos warten'} auf dich, bevor sie zu Lion gehen</span>
      </div>

      <ul className="fg-liste">
        {videos.map((v) => {
          const runde = offeneRunde(aenderungen, v.id)
          const platz = runde ? platzInSchlange(aenderungen, runde.id) : null
          const letzte = aenderungen.find((a) => a.video_id === v.id && a.status === 'erledigt')
          const auf = offen === v.id
          return (
            <li key={v.id} className={'fg-video' + (runde ? ' wartet' : '')}>
              <button className="fg-zeile" onClick={() => ansehen(v)}>
                <span className="fg-play"><Play size={15} /></span>
                <span className="fg-text">
                  <span className="fg-titel">{v.title}</span>
                  <span className="fg-unter">
                    {v.clients?.name ?? 'Kunde'}
                    {runde
                      ? runde.status === 'laeuft' ? ' · wird geändert' : ` · Platz ${platz ?? '–'}`
                      : letzte ? ' · neu' : ''}
                  </span>
                </span>
              </button>

              {auf && (
                <div className="fg-inhalt">
                  {links[v.id]
                    ? <video className="fg-player" src={links[v.id]} controls playsInline preload="metadata" />
                    : <div className="fg-lade"><Loader2 size={18} className="spin" /></div>}

                  {runde ? (
                    <div className="fg-hinweis">
                      „{runde.wunsch}“ · {runde.status === 'laeuft' ? 'läuft' : 'wartet'}
                    </div>
                  ) : wunschFuer === v.id ? (
                    <div className="fg-wunsch">
                      <textarea
                        autoFocus rows={3} value={wunsch} onChange={(e) => setWunsch(e.target.value)}
                        placeholder="Was soll anders?"
                      />
                      <div className="fg-knoepfe">
                        <button className="btn btn-sm" onClick={() => { setWunschFuer(null); setWunsch('') }}>Abbrechen</button>
                        <button className="btn btn-sm btn-primary" disabled={busy === v.id || !wunsch.trim()} onClick={() => schicken(v)}>
                          {busy === v.id ? <Loader2 size={15} className="spin" /> : <Pencil size={15} />} Senden
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="fg-knoepfe">
                      <button className="btn btn-sm" onClick={() => { setWunschFuer(v.id); setWunsch('') }}>
                        <Pencil size={15} /> Ändern
                      </button>
                      <button className="btn btn-sm btn-primary" disabled={busy === v.id} onClick={() => los(v)}>
                        {busy === v.id ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Freigeben
                      </button>
                    </div>
                  )}
                  {letzte?.notiz && !runde && <div className="fg-notiz">{letzte.notiz}</div>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
