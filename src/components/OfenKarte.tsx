// Schnittofen (Logik: lib/ofen.ts)
//   Warteschlange -> Im Ofen -> Raus (Vorschau, darunter) -> Tablett (bereit zum Posten)
// Live: aktualisiert sich, sobald die Automatik weiterkommt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Plus, RotateCcw, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'
import { automatikAnstossen } from '../lib/automatik'
import { rangVon } from '../lib/kundenart'
import Modal from './Modal'
import {
  ausDerSchlange, inDenOfen, ladeOfen, nachVorne, nochmal, seitText,
  type Ofen, type OfenAuftrag, type OfenVideo,
} from '../lib/ofen'

function Logo({ v, gross }: { v?: OfenVideo | null; gross?: boolean }) {
  const c = v?.clients
  return (
    <span className={`of-logo ${gross ? 'gross' : ''}`}>
      {c?.logo_url ? <img src={c.logo_url} alt={c.name} /> : <span>{(c?.name ?? '?').slice(0, 1)}</span>}
    </span>
  )
}

export default function OfenKarte() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [ofen, setOfen] = useState<Ofen | null>(null)
  const [neu, setNeu] = useState(false)
  const [, setTick] = useState(0)
  const warte = useRef<number | null>(null)

  const laden = useCallback(async () => {
    try { setOfen(await ladeOfen()) } catch { /* Tabelle fehlt -> Karte bleibt weg */ }
  }, [])
  useEffect(() => { laden() }, [laden])
  useEffect(() => {
    const neuLaden = () => {
      if (warte.current) window.clearTimeout(warte.current)
      warte.current = window.setTimeout(() => laden(), 600)
    }
    const ch = supabase.channel('ofen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, neuLaden)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos' }, neuLaden)
      .subscribe()
    // "seit 12 Min." weiterzaehlen
    const uhr = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => { supabase.removeChannel(ch); window.clearInterval(uhr) }
  }, [laden])

  async function tun(p: Promise<void>, ok: string) {
    try { await p; toast(ok); laden() } catch (e) { toast('Ging nicht: ' + (e as Error).message) }
  }

  if (!ofen) return null
  if (window.location.hash === '#ofen') {
    window.setTimeout(() => document.getElementById('ofen')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    history.replaceState(null, '', window.location.pathname)
  }
  const { imOfen, schlange, haengt, tablett } = ofen

  return (
    <section className="of-karte" id="ofen" aria-label="Schnittofen">
      <div className="of-kopf">
        <strong>Schnittofen</strong>
        <button type="button" className="aktion haupt" onClick={() => setNeu(true)}><Plus strokeWidth={2.4} /><span>Video</span></button>
      </div>

      {/* --------------------------------------------------------- Im Ofen */}
      <div className={`of-ofen ${imOfen ? 'an' : ''}`}>
        {imOfen ? (
          <button type="button" className="of-ofen-inhalt" onClick={() => imOfen.videos && navigate(`/client/${imOfen.videos.client_id}?video=${imOfen.video_id}&open=1`)}>
            <Logo v={imOfen.videos} gross />
            <span className="of-ofen-text">
              <span className="of-ofen-titel">{imOfen.videos?.title ?? 'Video'}</span>
              <span className="of-ofen-unter">{imOfen.videos?.clients?.name} · seit {seitText(imOfen.gestartet_am ?? imOfen.created_at)}</span>
              <span className="of-ofen-wunsch">{imOfen.wunsch}</span>
            </span>
          </button>
        ) : (
          <span className="of-ofen-leer">{schlange.length ? 'Startet gleich' : 'Ofen ist leer'}</span>
        )}
        <span className="of-glut" aria-hidden />
      </div>

      {/* ---------------------------------------------------- Warteschlange */}
      {schlange.length > 0 && (
        <>
          <div className="of-abschnitt"><span>Warteschlange</span><b>{schlange.length}</b></div>
          <ol className="of-schlange">
            {schlange.map((a, i) => (
              <li key={a.id}>
                <span className="of-platz">{i + 1}</span>
                <Logo v={a.videos} />
                <span className="of-text">
                  <span className="of-titel">{a.videos?.title ?? 'Video'}</span>
                  <span className="of-unter">{a.art === 'aenderung' ? 'Änderung' : 'Neu'} · {a.wunsch}</span>
                </span>
                {i > 0 && (
                  <button type="button" className="of-knopf" aria-label="Nach vorne" onClick={() => tun(nachVorne(a.id), 'Als Nächstes dran')}>
                    <ArrowUp strokeWidth={2.4} />
                  </button>
                )}
                <button type="button" className="of-knopf leise" aria-label="Aus der Schlange nehmen" onClick={() => tun(ausDerSchlange(a.id), 'Rausgenommen')}>
                  <X strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* ------------------------------------------------------------ Haengt */}
      {haengt.length > 0 && (
        <ul className="of-schlange of-haengt">
          {haengt.map((a: OfenAuftrag) => (
            <li key={a.id}>
              <Logo v={a.videos} />
              <span className="of-text">
                <span className="of-titel">{a.videos?.title ?? 'Video'}</span>
                <span className="of-unter rot">{a.notiz || 'Hängt'}</span>
              </span>
              <button type="button" className="of-knopf" aria-label="Nochmal" onClick={() => tun(nochmal(a.id), 'Wieder eingereiht')}>
                <RotateCcw strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ----------------------------------------------------------- Tablett */}
      {tablett.length > 0 && (
        <>
          <div className="of-abschnitt"><span>Tablett · bereit zum Posten</span><b>{tablett.length}</b></div>
          <div className="of-tablett">
            {tablett.map((v) => (
              <button key={v.id} type="button" className="of-teller" onClick={() => navigate(`/client/${v.client_id}?video=${v.id}&open=1`)}>
                <Logo v={v} />
                <span className="of-titel">{v.title}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {neu && (
        <NeuInDenOfen
          onClose={() => setNeu(false)}
          onFertig={async (video, anweisung, vorne) => {
            try {
              await inDenOfen({ video, anweisung, vorne, memberId })
              void automatikAnstossen(`Schnittofen: ${video.title ?? 'Video'} (${video.clients?.name ?? 'Kunde'})`)
              toast(vorne ? 'Als Nächstes im Ofen' : 'In der Warteschlange')
              setNeu(false)
              laden()
            } catch (e) { toast('Ging nicht: ' + (e as Error).message) }
          }}
        />
      )}
    </section>
  )
}

/** Video aussuchen, kurz sagen, wie es werden soll, ab in den Ofen. */
function NeuInDenOfen({ onClose, onFertig }: {
  onClose: () => void
  onFertig: (v: OfenVideo, anweisung: string, vorne: boolean) => Promise<void>
}) {
  const { memberId } = useIdentity()
  const [videos, setVideos] = useState<OfenVideo[] | null>(null)
  const [wahl, setWahl] = useState<OfenVideo | null>(null)
  const [anweisung, setAnweisung] = useState('')
  const [vorne, setVorne] = useState(false)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    supabase.from('videos')
      .select('id, title, client_id, produktion_stufe, status, scheduled_date, bearbeiter_id, clients(name, logo_url, client_type, zustaendig_id, deleted_at)')
      .is('deleted_at', null).neq('status', 'posted')
      .or('produktion_stufe.is.null,produktion_stufe.eq.roh')
      .order('scheduled_date', { ascending: true, nullsFirst: false }).limit(80)
      .then(({ data }) => {
        const alle = ((data ?? []) as unknown as (OfenVideo & { clients?: { deleted_at?: string | null } })[])
          .filter((v) => !v.clients?.deleted_at)
        // Meine Kunden zuerst, dann nach Prioritaet und Posting-Tag
        const meins = (v: OfenVideo) => ((v.bearbeiter_id ?? v.clients?.zustaendig_id) === memberId ? 0 : 1)
        setVideos(alle.sort((a, b) => meins(a) - meins(b) || rangVon(a.clients?.client_type) - rangVon(b.clients?.client_type)))
      })
  }, [memberId])

  return (
    <Modal title={wahl ? (wahl.title ?? 'Video') : 'Welches Video?'} onClose={onClose}>
      {!wahl ? (
        <div className="of-auswahl">
          {videos === null ? <div className="fg-lade"><Loader2 size={18} className="spin" /></div>
            : videos.length === 0 ? <p className="fg-leer">Keine offenen Videos</p>
            : videos.map((v) => (
              <button key={v.id} type="button" className="of-wahl" onClick={() => setWahl(v)}>
                <Logo v={v} />
                <span className="of-text">
                  <span className="of-titel">{v.title}</span>
                  <span className="of-unter">{v.clients?.name}{v.scheduled_date ? ` · ${new Date(v.scheduled_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}` : ''}</span>
                </span>
              </button>
            ))}
        </div>
      ) : (
        <div className="fg-wunsch">
          <textarea autoFocus rows={5} value={anweisung} onChange={(e) => setAnweisung(e.target.value)}
            placeholder="Wie soll es werden? Hook, Länge, Musik, Stil …" />
          <label className="of-vorne">
            <input type="checkbox" checked={vorne} onChange={(e) => setVorne(e.target.checked)} /> Als Nächstes
          </label>
          <div className="fg-knoepfe">
            <button className="btn btn-sm" onClick={() => setWahl(null)}>Zurück</button>
            <button className="btn btn-sm btn-primary" disabled={laeuft || !anweisung.trim()} onClick={async () => {
              setLaeuft(true)
              await onFertig(wahl, anweisung, vorne)
              setLaeuft(false)
            }}>
              {laeuft ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} In den Ofen
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
