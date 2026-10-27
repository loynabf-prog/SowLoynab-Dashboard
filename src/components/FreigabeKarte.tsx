// Vorschau: geschnittene Videos der eigenen Kunden (seit 27.10.2026 schneidet
// jeder seine Kunden mit Claude komplett selbst).
//
//   Vorschau ansehen -> "Fertig"       (bereit zum Posten, Ordner nach 4 Fertig)
//                    -> "Ändern"       (Wunsch reiht sich ein, Claude arbeitet nacheinander ab)
//                    -> "An <Name>"    (nur bei Problemen: an den anderen weitergeben)
//
// Standard: nur meine Videos. "Alle" zeigt auch die des anderen.

import { useCallback, useEffect, useState } from 'react'
import { Check, CornerUpRight, Loader2, Pencil, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dropbox } from '../lib/medien'
import { aendern, bearbeiterVon, fertigMachen, ladeFreigaben, weitergeben, offeneRunde, platzInSchlange, vorschauPfad, type Aenderung, type PruefVideo } from '../lib/freigabe'
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

  const [alle, setAlle] = useState(false)
  const [vorne, setVorne] = useState(false)
  const aktive = members.filter((m) => m.active !== false)
  const nameVon = (id: string | null) => aktive.find((m) => m.id === id)?.name ?? null
  const anderer = aktive.find((m) => m.id !== memberId) ?? null

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

  async function fertig(v: PruefVideo) {
    setBusy(v.id)
    try {
      await fertigMachen(v, memberId)
      toast('Fertig – bereit zum Posten')
      setOffen(null)
      laden()
    } catch (e) {
      toast('Ging nicht: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function abgeben(v: PruefVideo) {
    if (!anderer) return
    setBusy(v.id)
    try {
      await weitergeben(v, anderer.id, memberId)
      toast(`An ${anderer.name} gegeben`)
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
      await aendern(v, wunsch, memberId, vorne)
      void automatikAnstossen(`Änderung: ${v.title} (${v.clients?.name ?? 'Kunde'})`)
      toast(vorne ? 'Als Nächstes im Ofen' : 'Zurück in die Warteschlange')
      setVorne(false)
      setWunsch('')
      setWunschFuer(null)
      laden()
    } catch (e) {
      toast('Ging nicht: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Meine: weitergegeben an mich, sonst der Kunde gehoert mir (ohne Zuordnung: alle sehen es)
  const meine = videos.filter((v) => { const b = bearbeiterVon(v); return !memberId || !b || b === memberId })
  const liste = alle ? videos : meine
  if (videos.length === 0) return null

  return (
    <div className="fg-karte">
      <div className="fg-kopf">
        <strong>Vorschau <span className="fg-zahl">{meine.length}</span></strong>
        {memberId && meine.length !== videos.length && (
          <div className="fg-umschalter" role="tablist">
            <button className={!alle ? 'on' : ''} onClick={() => setAlle(false)}>Meine</button>
            <button className={alle ? 'on' : ''} onClick={() => setAlle(true)}>Alle</button>
          </div>
        )}
      </div>

      {liste.length === 0 && <p className="fg-leer">Nichts für dich</p>}
      <ul className="fg-liste">
        {liste.map((v) => {
          const wer = nameVon(bearbeiterVon(v))
          const runde = offeneRunde(aenderungen, v.id)
          const platz = runde ? platzInSchlange(aenderungen, runde.id) : null
          const letzte = aenderungen.find((a) => a.video_id === v.id && a.status === 'erledigt')
          const auf = offen === v.id
          return (
            <li key={v.id} className={'fg-video' + (runde ? ' wartet' : '')}>
              <button className="fg-zeile" onClick={() => ansehen(v)}>
                {/* Echtes Kundenlogo mit Play-Zeichen statt Symbol */}
                <span className="fg-bild">
                  {v.clients?.logo_url ? <img src={v.clients.logo_url} alt={v.clients?.name ?? ''} /> : <span className="bild-init">{(v.clients?.name ?? '?').slice(0, 1)}</span>}
                  <span className="fg-bild-play"><Play size={11} fill="currentColor" /></span>
                </span>
                <span className="fg-text">
                  <span className="fg-titel">{v.title}</span>
                  <span className="fg-unter">
                    {v.clients?.name ?? 'Kunde'}
                    {alle && wer ? ` · ${wer}` : ''}
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
                      <label className="of-vorne">
                        <input type="checkbox" checked={vorne} onChange={(e) => setVorne(e.target.checked)} /> Als Nächstes
                      </label>
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
                      {anderer && (
                        <button className="btn btn-sm" disabled={busy === v.id} onClick={() => abgeben(v)}>
                          <CornerUpRight size={15} /> An {anderer.name}
                        </button>
                      )}
                      <button className="btn btn-sm btn-primary" disabled={busy === v.id} onClick={() => fertig(v)}>
                        {busy === v.id ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Fertig
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
