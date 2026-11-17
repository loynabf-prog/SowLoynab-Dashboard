// Schnitt-Raum: Korrektur-Player (17.11.2026).
// ---------------------------------------------------------------------------
// Fassie: "Video pausieren, in dem Moment einen Text schreiben -- und du
// weisst genau, welche Sekunde gemeint ist."
//   - Vorschau aus dem Dropbox-Ordner des Videos (Versionen waehlbar)
//   - Schreiben pausiert das Video und merkt die Sekunde (auf 1/100)
//   - Bei Pause aufs Bild tippen = Stelle markieren ("hier")
//   - Bereich von-bis, Bild fuer Bild vor/zurueck, halbe Geschwindigkeit
//   - Marker auf der Zeitleiste, Tipp auf eine Anmerkung springt hin
//   - "An Claude" buendelt alle offenen Anmerkungen zu einem Auftrag
//     (video_aenderungen) und oeffnet den Chat des Videos
//   - "Freigeben" schliesst die Runde

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Crosshair, MessageCircle, Pause, Play, Send, SkipBack, SkipForward, Trash2, X, BadgeCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dropbox, type Eintrag } from '../lib/medien'
import { chatLink, chatAuftrag } from '../lib/backstube'
import { heute as heuteIso } from '../lib/datum'
import { useIdentity } from '../context/IdentityContext'
import { FPS, zeit, korrekturText, vorschauDateien, deadlineText, deadlineLage, type Kommentar } from '../lib/schnitt'
import '../styles/schnitt.css'

interface Video {
  id: string
  title: string | null
  client_id: string
  status: string
  produktion_stufe: string | null
  scheduled_date: string | null
  dropbox_pfad: string | null
  archiv_pfad: string | null
  video_url: string | null
  chat_url: string | null
  clients: { name: string } | null
}

export default function SchnittRaum() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const ref = useRef<HTMLVideoElement>(null)
  const eingabe = useRef<HTMLTextAreaElement>(null)

  const [video, setVideo] = useState<Video | null>(null)
  const [dateien, setDateien] = useState<Eintrag[]>([])
  const [datei, setDatei] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState('')
  const [kommentare, setKommentare] = useState<Kommentar[]>([])

  const [t, setT] = useState(0)
  const [dauer, setDauer] = useState(0)
  const [spielt, setSpielt] = useState(false)
  const [tempo, setTempo] = useState(1)

  const [text, setText] = useState('')
  const [ab, setAb] = useState<number | null>(null)      // Sekunde der Anmerkung (beim Pausieren gemerkt)
  const [bis, setBis] = useState<number | null>(null)    // optionales Bereichsende
  const [punkt, setPunkt] = useState<{ x: number; y: number } | null>(null)
  const [zeigeErledigt, setZeigeErledigt] = useState(false)
  const [hinweis, setHinweis] = useState('')
  const [busy, setBusy] = useState(false)
  const tag = heuteIso()

  // ---------- Laden
  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data, error } = await supabase.from('videos')
        .select('id, title, client_id, status, produktion_stufe, scheduled_date, dropbox_pfad, archiv_pfad, video_url, chat_url, clients(name)')
        .eq('id', id).maybeSingle()
      if (error || !data) { setFehler('Video nicht gefunden.'); setLaedt(false); return }
      const v = data as unknown as Video
      setVideo(v)
      const ordner = [v.dropbox_pfad, v.archiv_pfad].filter(Boolean) as string[]
      const liste = ordner.length ? await vorschauDateien(ordner) : []
      setDateien(liste)
      if (liste[0]) setDatei(liste[0].pfad)
      else if (v.video_url) setSrc(v.video_url)
      else setFehler('Noch keine Vorschau im Video-Ordner.')
      setLaedt(false)
    })()
  }, [id])

  useEffect(() => {
    if (!datei) return
    setSrc(null)
    dropbox.link(datei).then(setSrc).catch((e) => setFehler(`Vorschau nicht ladbar: ${(e as Error).message}`))
  }, [datei])

  const ladeKommentare = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('video_kommentare').select('*').eq('video_id', id).order('sekunde')
    setKommentare(((data ?? []) as Kommentar[]).map((k) => ({ ...k, sekunde: Number(k.sekunde), bis_sekunde: k.bis_sekunde == null ? null : Number(k.bis_sekunde) })))
  }, [id])
  useEffect(() => {
    ladeKommentare()
    const ch = supabase.channel(`schnitt-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_kommentare', filter: `video_id=eq.${id}` }, () => ladeKommentare())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, ladeKommentare])

  // ---------- Player
  const pause = () => { ref.current?.pause() }
  const umschalten = () => { const el = ref.current; if (!el) return; el.paused ? el.play() : el.pause() }
  const springe = (s: number) => { const el = ref.current; if (!el) return; el.currentTime = Math.min(Math.max(0, s), el.duration || s) }
  const schritt = (frames: number) => { pause(); springe((ref.current?.currentTime ?? 0) + frames / FPS) }
  useEffect(() => { if (ref.current) ref.current.playbackRate = tempo }, [tempo, src])

  // Schreiben beginnt -> pausieren und Sekunde merken
  function schreibStart() {
    pause()
    if (ab == null) setAb(ref.current?.currentTime ?? t)
  }
  function bildTipp(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    if (!el.paused) { el.pause(); return }
    const r = e.currentTarget.getBoundingClientRect()
    setPunkt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
    if (ab == null) setAb(el.currentTime)
    eingabe.current?.focus()
  }
  function bereich() {
    const jetzt = ref.current?.currentTime ?? t
    if (ab == null) { setAb(jetzt); setHinweis('Start gesetzt – spiel bis zum Ende und tipp nochmal'); return }
    if (bis == null && jetzt > ab + 0.05) { setBis(jetzt); pause(); setHinweis(''); eingabe.current?.focus(); return }
    setBis(null)
  }
  function verwerfen() { setText(''); setAb(null); setBis(null); setPunkt(null); setHinweis('') }

  async function speichern() {
    if (!id || !text.trim()) return
    const sek = ab ?? ref.current?.currentTime ?? t
    setBusy(true)
    const { error } = await supabase.from('video_kommentare').insert({
      video_id: id, datei, sekunde: Number(sek.toFixed(2)), bis_sekunde: bis != null ? Number(bis.toFixed(2)) : null,
      x: punkt?.x ?? null, y: punkt?.y ?? null, text: text.trim(), member_id: memberId,
    })
    setBusy(false)
    if (error) { setHinweis(error.message); return }
    verwerfen()
    ladeKommentare()
  }

  async function erledigt(k: Kommentar) {
    await supabase.from('video_kommentare').update({ erledigt: !k.erledigt, erledigt_am: k.erledigt ? null : new Date().toISOString() }).eq('id', k.id)
    ladeKommentare()
  }
  async function loeschen(k: Kommentar) {
    if (!confirm('Anmerkung löschen?')) return
    await supabase.from('video_kommentare').delete().eq('id', k.id)
    ladeKommentare()
  }

  const offen = useMemo(() => kommentare.filter((k) => !k.erledigt), [kommentare])
  const erledigte = useMemo(() => kommentare.filter((k) => k.erledigt), [kommentare])
  const neuOffen = offen.filter((k) => !k.aenderung_id)

  async function anClaude() {
    if (!video || !neuOffen.length) return
    setBusy(true)
    const kunde = video.clients?.name ?? 'Kunde'
    const titel = video.title ?? 'Video'
    const zettel = korrekturText(titel, kunde, datei, neuOffen)
    const { data: auftrag, error } = await supabase.from('video_aenderungen').insert({
      video_id: video.id, client_id: video.client_id, art: 'aenderung', status: 'offen',
      wunsch: zettel, created_by: null,
    }).select('id').single()
    if (error) { setBusy(false); setHinweis(error.message); return }
    await supabase.from('video_kommentare').update({ aenderung_id: (auftrag as { id: string }).id }).in('id', neuOffen.map((k) => k.id))
    await supabase.from('videos').update({ produktion_stufe: 'feinschliff' }).eq('id', video.id)
    setVideo({ ...video, produktion_stufe: 'feinschliff' })
    const nachricht = `${zettel}\n\n(Stehen auch in video_kommentare, video_id ${video.id}.) Bitte einarbeiten und neue Vorschau in den Video-Ordner legen.`
    try { await navigator.clipboard.writeText(nachricht) } catch { /* egal */ }
    const ziel = video.chat_url && /^https:\/\/claude\.ai\//.test(video.chat_url)
      ? video.chat_url
      : `https://claude.ai/new?q=${encodeURIComponent(chatAuftrag({ id: video.id, title: titel, clients: { id: video.client_id, name: kunde } }) + '\n\n' + nachricht)}`
    setBusy(false)
    setHinweis(video.chat_url ? 'Korrekturen kopiert – im Chat einfügen' : 'Chat geöffnet')
    ladeKommentare()
    window.open(ziel, '_blank', 'noopener')
  }

  async function freigeben() {
    if (!video) return
    if (offen.length && !confirm(`Es sind noch ${offen.length} Anmerkungen offen. Trotzdem freigeben?`)) return
    await supabase.from('videos').update({ produktion_stufe: 'fertig', freigegeben_am: new Date().toISOString(), freigegeben_von: memberId }).eq('id', video.id)
    navigate('/schnitt')
  }

  // ---------- Tastatur (Laptop)
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); speichern() }
        if (e.key === 'Escape') { (e.target as HTMLElement).blur() }
        return
      }
      if (e.key === ' ') { e.preventDefault(); umschalten() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? springe((ref.current?.currentTime ?? 0) - 1) : schritt(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? springe((ref.current?.currentTime ?? 0) + 1) : schritt(1) }
      else if (e.key === 'c' || e.key === 'k') { e.preventDefault(); schreibStart(); eingabe.current?.focus() }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })

  // Anmerkungen, deren Stelle gerade im Bild ist (+-0,6 s)
  const sichtbarePunkte = offen.filter((k) => k.x != null && k.y != null && Math.abs(k.sekunde - t) < 0.6)
  const markerZeit = ab ?? t

  if (laedt) return <div className="sr-laedt">Lade Video …</div>
  if (!video) return <div className="sr-laedt">{fehler || 'Video nicht gefunden.'}</div>
  const lage = deadlineLage(video.scheduled_date, tag)

  return (
    <div className="sr">
      <div className="sr-kopf">
        <button className="sr-zurueck" onClick={() => navigate('/schnitt')} aria-label="Zurück"><ArrowLeft size={20} /></button>
        <div className="sr-titel">
          <strong>{video.title || 'Ohne Titel'}</strong>
          <small>{video.clients?.name} · <span className={`sl-frist ${lage}`}>{deadlineText(video.scheduled_date, tag)}</span></small>
        </div>
        <a className="sr-chat" href={chatLink({ id: video.id, title: video.title ?? 'Video', chat_url: video.chat_url, clients: { id: video.client_id, name: video.clients?.name ?? '' } })} target="_blank" rel="noopener" title="Chat zu diesem Video">
          <MessageCircle size={18} />
        </a>
      </div>

      <div className="sr-buehne">
        <div className="sr-player-spalte">
          {dateien.length > 1 && (
            <select className="input sr-version" value={datei ?? ''} onChange={(e) => setDatei(e.target.value)}>
              {dateien.map((d, i) => <option key={d.pfad} value={d.pfad}>{i === 0 ? 'Neueste: ' : ''}{d.name}</option>)}
            </select>
          )}
          <div className="sr-player" onClick={bildTipp}>
            {src ? (
              <video
                ref={ref}
                src={src}
                playsInline
                preload="auto"
                onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDauer(e.currentTarget.duration)}
                onPlay={() => { setSpielt(true); if (!text.trim()) { setAb(null); setBis(null); setPunkt(null) } }}
                onPause={() => setSpielt(false)}
              />
            ) : (
              <div className="sr-kein">{fehler || 'Vorschau wird geladen …'}</div>
            )}
            {sichtbarePunkte.map((k) => <span key={k.id} className="sr-pin alt" style={{ left: `${k.x! * 100}%`, top: `${k.y! * 100}%` }} title={k.text} />)}
            {punkt && <span className="sr-pin neu" style={{ left: `${punkt.x * 100}%`, top: `${punkt.y * 100}%` }} />}
            {!spielt && src && !text && <span className="sr-tipp-hinweis">Tipp aufs Bild = Stelle markieren</span>}
          </div>

          <div className="sr-zeitleiste">
            <span className="sr-zeit">{zeit(t)}</span>
            <div className="sr-leiste">
              <input type="range" min={0} max={dauer || 0} step={1 / FPS} value={t} onChange={(e) => { pause(); springe(Number(e.target.value)) }} aria-label="Zeitleiste" />
              {dauer > 0 && offen.map((k) => (
                <button key={k.id} className="sr-marke" style={{ left: `${(k.sekunde / dauer) * 100}%`, width: k.bis_sekunde ? `${((k.bis_sekunde - k.sekunde) / dauer) * 100}%` : undefined }}
                  onClick={() => { pause(); springe(k.sekunde) }} title={`${zeit(k.sekunde)} ${k.text}`} />
              ))}
              {dauer > 0 && ab != null && <span className="sr-marke neu" style={{ left: `${(ab / dauer) * 100}%`, width: bis ? `${((bis - ab) / dauer) * 100}%` : undefined }} />}
            </div>
            <span className="sr-zeit leise">{zeit(dauer)}</span>
          </div>

          <div className="sr-knoepfe">
            <button onClick={() => springe(t - 2)} aria-label="2 Sekunden zurück"><SkipBack size={18} /></button>
            <button onClick={() => schritt(-1)} aria-label="Ein Bild zurück"><ChevronLeft size={20} /></button>
            <button className="sr-play" onClick={umschalten} aria-label={spielt ? 'Pause' : 'Abspielen'}>{spielt ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
            <button onClick={() => schritt(1)} aria-label="Ein Bild vor"><ChevronRight size={20} /></button>
            <button onClick={() => springe(t + 2)} aria-label="2 Sekunden vor"><SkipForward size={18} /></button>
            <button className="sr-tempo" onClick={() => setTempo((x) => (x === 1 ? 0.5 : 1))}>{tempo === 1 ? '1×' : '½×'}</button>
          </div>
        </div>

        <div className="sr-seite">
          <div className="sr-eingabe">
            <div className="sr-eingabe-kopf">
              <span className="sr-bei">bei <b>{zeit(markerZeit)}</b>{bis != null && <> bis <b>{zeit(bis)}</b></>}</span>
              <button className={`sr-mini ${bis != null ? 'an' : ''}`} onClick={bereich} title="Bereich von–bis">{bis != null ? 'Bereich ✓' : ab != null && hinweis ? 'Ende setzen' : 'Bereich'}</button>
              <button className={`sr-mini ${punkt ? 'an' : ''}`} onClick={() => (punkt ? setPunkt(null) : (pause(), setHinweis('Tipp aufs Bild, um die Stelle zu markieren')))} title="Stelle im Bild"><Crosshair size={14} />{punkt ? 'Stelle ✓' : 'Stelle'}</button>
            </div>
            <textarea
              ref={eingabe}
              className="input"
              rows={2}
              placeholder="Was soll hier anders? (Schreiben pausiert das Video)"
              value={text}
              onFocus={schreibStart}
              onChange={(e) => { if (ab == null) schreibStart(); setText(e.target.value) }}
            />
            <div className="sr-eingabe-fuss">
              {hinweis && <span className="sr-hinweis">{hinweis}</span>}
              {(text || ab != null) && <button className="btn btn-sm" onClick={verwerfen}><X size={14} />Verwerfen</button>}
              <button className="btn btn-sm btn-primary" onClick={speichern} disabled={!text.trim() || busy}><Send size={14} />Merken</button>
            </div>
          </div>

          <div className="sr-liste">
            <div className="sr-liste-kopf">
              <h3>Anmerkungen</h3><span>{offen.length} offen</span>
            </div>
            {offen.length === 0 && <p className="muted sr-leer">Noch nichts. Pausieren, schreiben, merken.</p>}
            {offen.map((k) => (
              <div key={k.id} className={`sr-k ${Math.abs(k.sekunde - t) < 0.4 ? 'jetzt' : ''}`}>
                <button className="sr-k-zeit" onClick={() => { pause(); springe(k.sekunde) }}>
                  {zeit(k.sekunde)}{k.bis_sekunde != null && `–${zeit(k.bis_sekunde)}`}
                </button>
                <div className="sr-k-text">
                  {k.text}
                  <small>{k.x != null && <><Crosshair size={11} /> Stelle markiert · </>}{k.aenderung_id ? 'an Claude geschickt' : 'neu'}</small>
                </div>
                <button className="sr-k-ok" onClick={() => erledigt(k)} title="Erledigt"><Check size={16} /></button>
                <button className="sr-k-weg" onClick={() => loeschen(k)} title="Löschen"><Trash2 size={14} /></button>
              </div>
            ))}
            {erledigte.length > 0 && (
              <button className="sr-erl-knopf" onClick={() => setZeigeErledigt((x) => !x)}>{zeigeErledigt ? 'Erledigte ausblenden' : `${erledigte.length} erledigt`}</button>
            )}
            {zeigeErledigt && erledigte.map((k) => (
              <div key={k.id} className="sr-k erledigt">
                <button className="sr-k-zeit" onClick={() => { pause(); springe(k.sekunde) }}>{zeit(k.sekunde)}</button>
                <div className="sr-k-text">{k.text}</div>
                <button className="sr-k-ok an" onClick={() => erledigt(k)} title="Wieder öffnen"><Check size={16} /></button>
              </div>
            ))}
          </div>

          <div className="sr-aktionen">
            <button className="btn btn-primary" onClick={anClaude} disabled={!neuOffen.length || busy}>
              <MessageCircle size={16} />{neuOffen.length ? `${neuOffen.length} an Claude schicken` : 'Alles bei Claude'}
            </button>
            <button className="btn sr-frei" onClick={freigeben}><BadgeCheck size={16} />Freigeben</button>
          </div>
        </div>
      </div>
    </div>
  )
}
