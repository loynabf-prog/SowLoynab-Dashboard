// Backstube -- die Ofen-Seite (Fassie, 28.10.2026)
// Eigene Vollbild-Seite ohne Leiste: der Arbeitsmodus fuer die Produktion.
// Pro Person ein Fliessband (Imbiss-Durchlaufofen): Zutaten -> Schlange ->
// Ofen (Pizza wandert mit dem Fortschritt durch) -> Ausgabe (zurueck oder
// weiter) -> Teller -> Gegessen. Pizza aus dem Ofen antippen oeffnet den
// Claude-Chat zu diesem Video (ein Chat pro Video, videos.chat_url).
// Logik: lib/backstube.ts. Live per Realtime.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Flame, Loader2, MessageCircle, Play, RotateCcw, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { automatikAnstossen } from '../lib/automatik'
import { dropbox } from '../lib/medien'
import { aendern, fertigMachen, vorschauPfad, type PruefVideo } from '../lib/freigabe'
import {
  STUFEN, aufDenZettel, chatLink, hintenAnstellen, ladeBackstube, nochmalBacken, seit, vordraengeln, zettelWeg,
  type Backstube, type OfenStand, type Pizza, type Stufe,
} from '../lib/backstube'
import '../styles/backstube.css'

type Sicht = 'alle' | 'meins'

/** Standbilder der Videos (Standbild.jpg im Video-Ordner), per video_id */
const Bilder = createContext<Map<string, string>>(new Map())

/** Kurzes Klingeln + Vibration, wenn eine Pizza rauskommt (nur solange die Seite offen ist). */
function klingeln() {
  try { navigator.vibrate?.([80, 60, 80]) } catch { /* egal */ }
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = i ? 1568 : 1319
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.9)
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 1)
    })
    window.setTimeout(() => ctx.close(), 1500)
  } catch { /* egal */ }
}

export default function Ofen() {
  const navigate = useNavigate()
  const { memberId } = useIdentity()
  const { members } = useTeam()
  const { toast } = useToast()
  const [daten, setDaten] = useState<Backstube | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sicht, setSicht] = useState<Sicht>('alle')
  const [offen, setOffen] = useState<Pizza | null>(null)
  const [, setTick] = useState(0)
  const [bilder, setBilder] = useState<Map<string, string>>(new Map())
  const warte = useRef<number | null>(null)
  const rausVorher = useRef<Set<string> | null>(null)

  const team = useMemo(() => members.filter((m) => m.active !== false), [members])
  const teamIds = useMemo(() => team.map((m) => m.id).join(','), [team])

  const laden = useCallback(async () => {
    if (!teamIds) return
    try { setDaten(await ladeBackstube(teamIds.split(','))); setFehler(null) }
    catch (e) { setFehler((e as Error).message) }
  }, [teamIds])

  useEffect(() => { laden() }, [laden])

  // Klingeln, wenn seit dem letzten Laden eine Pizza neu rausgekommen ist
  useEffect(() => {
    if (!daten) return
    const jetzt = new Set(daten.pizzen.filter((p) => p.stufe === 'raus').map((p) => p.video.id))
    const vorher = rausVorher.current
    if (vorher && [...jetzt].some((id) => !vorher.has(id))) klingeln()
    rausVorher.current = jetzt
  }, [daten])

  // Standbilder fuer alles, was schon einen Video-Ordner hat
  useEffect(() => {
    if (!daten) return
    const kandidaten = daten.pizzen
      .filter((p) => ['zettel', 'ofen', 'raus', 'teller'].includes(p.stufe) && p.video.dropbox_pfad && !/\.mp4$/i.test(p.video.dropbox_pfad) && !bilder.has(p.video.id))
      .slice(0, 25)
    if (!kandidaten.length) return
    const pfade = kandidaten.map((p) => `${p.video.dropbox_pfad!.replace(/\/+$/, '')}/Standbild.jpg`)
    dropbox.vorschauen(pfade).then((r) => {
      setBilder((alt) => {
        const neu = new Map(alt)
        r.forEach((x, i) => { neu.set(kandidaten[i].video.id, x.bild ?? '') })
        return neu
      })
    }).catch(() => { /* ohne Bild geht es auch */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten])
  useEffect(() => {
    const neu = () => {
      if (warte.current) window.clearTimeout(warte.current)
      warte.current = window.setTimeout(() => laden(), 500)
    }
    const ch = supabase.channel('backstube')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_aenderungen' }, neu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, neu)
      .subscribe()
    const uhr = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => { supabase.removeChannel(ch); window.clearInterval(uhr) }
  }, [laden])

  // Offene Pizza mit frischen Daten nachziehen
  useEffect(() => {
    if (!offen || !daten) return
    const frisch = daten.pizzen.find((p) => p.video.id === offen.video.id)
    if (frisch && (frisch.stufe !== offen.stufe || frisch.auftrag?.id !== offen.auftrag?.id || frisch.auftrag?.fortschritt !== offen.auftrag?.fortschritt)) setOffen(frisch)
  }, [daten, offen])

  async function tun(p: Promise<void>, ok: string, anstossen?: string) {
    try {
      await p
      toast(ok)
      if (anstossen) void automatikAnstossen(anstossen)
      laden()
    } catch (e) { toast('Ging nicht: ' + (e as Error).message) }
  }

  // Pizza aus dem Ofen: im Claude-Chat besprechen (ein Chat pro Video)
  function chatOeffnen(p: Pizza) {
    window.open(chatLink(p.video), '_blank', 'noopener')
  }

  const sichtbar = (b: string | null) => sicht === 'alle' || !memberId || b === memberId
  const oefen = team
    .filter((m) => sichtbar(m.id))
    .sort((a, b) => (a.id === memberId ? -1 : 0) - (b.id === memberId ? -1 : 0))
    .map((m) => ({ m, stand: daten?.oefen.get(m.id) }))

  const jetzt = new Date()

  return (
    <Bilder.Provider value={bilder}>
    <div className="bs bs-kueche">
      <header className="bs-kopf">
        <button type="button" className="bs-rund" aria-label="Zurück" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft strokeWidth={2.2} />
        </button>
        <div className="bs-titel">
          <span className="bs-ueber">{jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1 className="bs-neon">BACKSTUBE</h1>
        </div>
        <div className="bs-schalter" role="tablist">
          <button type="button" className={sicht === 'alle' ? 'an' : ''} onClick={() => setSicht('alle')}>Beide</button>
          <button type="button" className={sicht === 'meins' ? 'an' : ''} onClick={() => setSicht('meins')}>Meiner</button>
        </div>
      </header>

      {fehler && <p className="bs-fehler">Konnte nicht laden: {fehler}</p>}
      {!daten && !fehler && <div className="bs-lade"><Loader2 className="spin" /></div>}

      {daten && (
        <>
          {/* ------------------------------------------- Fliessbaender */}
          <div className="fb-liste">
            {oefen.map(({ m, stand }) => {
              const von = (s: Stufe) => (daten?.pizzen ?? []).filter((p) => p.stufe === s && p.besitzer === m.id)
              return (
                <Fliessband
                  key={m.id}
                  name={m.id === memberId ? 'Dein Ofen' : `${m.name}s Ofen`}
                  farbe={m.color}
                  stand={stand}
                  zutaten={von('belegt')}
                  teig={von('teig').length}
                  teller={von('teller')}
                  gegessen={von('gegessen')}
                  onPizza={setOffen}
                  onChat={chatOeffnen}
                  onServieren={(p) => tun(fertigMachen(alsPruef(p), memberId), '🍕 Serviert – liegt in Zum Posten')}
                  onAnwerfen={() => tun(Promise.resolve(), 'Ofen wird angeworfen', `Backstube: ${m.name}s Ofen anwerfen`)}
                  onNochmal={(id) => tun(nochmalBacken(id), 'Wieder angestellt', 'Backstube: angebrannte Pizza nochmal')}
                />
              )
            })}
          </div>

          {/* -------------------------------------------- Bestellungen */}
          <section className="bs-theke">
            <div className="bs-theke-kopf">
              <h2>Bestellungen</h2>
              <span>{jetzt.toLocaleDateString('de-DE', { month: 'long' })}</span>
            </div>
            <div className="bs-bestellungen">
              {daten.bestellungen.filter((b) => sichtbar(b.besitzer)).map((b) => {
                const fertig = b.zaehlung.teller + b.zaehlung.gegessen
                const gesamt = Math.max(b.soll, STUFEN.reduce((s, x) => s + b.zaehlung[x.key], 0), 1)
                return (
                  <button key={b.kunde.id} type="button" className="bs-bestellung" onClick={() => navigate(`/client/${b.kunde.id}`)}>
                    <span className="bs-logo">{b.kunde.logo_url ? <img src={b.kunde.logo_url} alt="" /> : b.kunde.name.slice(0, 1)}</span>
                    <span className="bs-best-text">
                      <span className="bs-best-name">{b.kunde.name}</span>
                      <span className="bs-balken" aria-hidden>
                        {STUFEN.map((s) => b.zaehlung[s.key] > 0 && (
                          <i key={s.key} className={`st-${s.key}`} style={{ width: `${(b.zaehlung[s.key] / gesamt) * 100}%` }} />
                        ))}
                      </span>
                      <span className="bs-best-zeile">
                        {STUFEN.filter((s) => b.zaehlung[s.key] > 0).map((s) => `${b.zaehlung[s.key]} ${s.name}`).join(' · ') || 'Noch nichts angelegt'}
                      </span>
                    </span>
                    <span className="bs-best-zahl"><b>{fertig}</b>/{b.soll || '–'}</span>
                  </button>
                )
              })}
            </div>
            <div className="bs-legende">
              {STUFEN.map((s) => <span key={s.key}><i className={`st-${s.key}`} />{s.name}</span>)}
            </div>
          </section>
        </>
      )}

      {offen && (
        <PizzaBlatt
          pizza={offen}
          besitzerName={team.find((m) => m.id === offen.besitzer)?.name ?? null}
          onClose={() => setOffen(null)}
          onKunde={() => navigate(`/client/${offen.video.client_id}?video=${offen.video.id}&open=1`)}
          onChat={() => chatOeffnen(offen)}
          onZettel={async (text, vorne) => {
            await tun(aufDenZettel(offen, text, vorne, memberId), vorne ? 'Als Nächstes dran' : 'Liegt auf dem Bestellzettel',
              `Backstube: ${offen.video.title} (${offen.video.clients?.name ?? 'Kunde'})`)
            setOffen(null)
          }}
          onZurueck={async (text, vorne) => {
            await tun(aendern(alsPruef(offen), text, memberId, vorne), 'Zurück in den Ofen',
              `Backstube: Änderung ${offen.video.title}`)
            setOffen(null)
          }}
          onServieren={async () => {
            await tun(fertigMachen(alsPruef(offen), memberId), '🍕 Serviert – bereit zum Posten')
            setOffen(null)
          }}
          onVorne={() => tun(vordraengeln(offen.auftrag!.id), 'Vorgedrängelt')}
          onHinten={() => tun(hintenAnstellen(offen.auftrag!.id), 'Hinten angestellt')}
          onWeg={async () => { await tun(zettelWeg(offen.auftrag!.id), 'Zettel weggenommen'); setOffen(null) }}
        />
      )}
    </div>
    </Bilder.Provider>
  )
}

function alsPruef(p: Pizza): PruefVideo & { scheduled_date?: string | null } {
  return {
    id: p.video.id, title: p.video.title, client_id: p.video.client_id, dropbox_pfad: p.video.dropbox_pfad ?? null, scheduled_date: p.video.scheduled_date,
    produktion_stufe: p.video.produktion_stufe ?? null, bearbeiter_id: p.video.bearbeiter_id ?? null,
    clients: p.video.clients ? { name: p.video.clients.name, logo_url: p.video.clients.logo_url, zustaendig_id: p.video.clients.zustaendig_id } : null,
  }
}

/* ======================================================================== */

function PizzaRund({ p, gross, ring }: { p: Pizza; gross?: boolean; ring?: number | null }) {
  const bild = useContext(Bilder).get(p.video.id)
  const c = p.video.clients
  const r = 46, u = 2 * Math.PI * r
  return (
    <span className={`bs-pizza st-${p.stufe} ${gross ? 'gross' : ''}`}>
      {ring != null && (
        <svg className="bs-ring" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} className="bs-ring-bahn" />
          <circle cx="50" cy="50" r={r} className="bs-ring-wert" strokeDasharray={u} strokeDashoffset={u * (1 - Math.min(100, Math.max(3, ring)) / 100)} />
        </svg>
      )}
      <span className={`bs-pizza-mitte ${bild ? 'mit-bild' : ''}`}>
        {bild ? <img src={bild} alt="" /> : c?.logo_url ? <img src={c.logo_url} alt="" /> : <span>{(c?.name ?? '?').slice(0, 1)}</span>}
      </span>
      {bild && c?.logo_url && <span className="bs-pizza-logo"><img src={c.logo_url} alt="" /></span>}
    </span>
  )
}

/** Ein Fliessband pro Ofen: Zutaten -> Schlange -> Ofen -> Ausgabe -> Teller -> Gegessen */
export function Fliessband({ name, farbe, stand, zutaten, teig, teller, gegessen, onPizza, onChat, onServieren, onAnwerfen, onNochmal }: {
  name: string
  farbe: string
  stand?: OfenStand
  zutaten: Pizza[]
  teig: number
  teller: Pizza[]
  gegessen: Pizza[]
  onPizza: (p: Pizza) => void
  onChat: (p: Pizza) => void
  onServieren: (p: Pizza) => void
  onAnwerfen: () => void
  onNochmal: (auftragId: string) => void
}) {
  const drin = stand?.imOfen ?? null
  const schlange = (stand?.schlange ?? []).filter((p) => p !== drin)
  const raus = stand?.raus ?? []
  const angebrannt = stand?.angebrannt ?? []
  const zustand = drin ? 'an' : schlange.length ? 'wartet' : 'leer'
  const prozent = Math.max(4, Math.min(96, drin?.auftrag?.fortschritt ?? 0))
  const strecke = useRef<HTMLDivElement | null>(null)
  const ofenRef = useRef<HTMLDivElement | null>(null)

  // Auf dem Handy direkt zum Ofen scrollen
  useEffect(() => {
    const s = strecke.current, o = ofenRef.current
    if (s && o && s.scrollWidth > s.clientWidth) s.scrollLeft = Math.max(0, o.offsetLeft - 12)
  }, [])

  return (
    <section className={`fb fb-${zustand}`}>
      <header className="fb-kopf">
        <i style={{ background: farbe }} />
        <h2>{name}</h2>
        <span className={`bs-zustand z-${zustand}`}>{zustand === 'an' ? 'backt' : zustand === 'wartet' ? 'wartet auf Start' : 'leer'}</span>
        <span className="fb-zahlen">{schlange.length} in der Schlange · {raus.length} raus · {teller.length} auf dem Teller</span>
      </header>

      <div className="fb-strecke" ref={strecke}>
       <div className="fb-innen">
        <div className="fb-band" aria-hidden><span /></div>

        {/* Zutaten */}
        <div className="fb-station fb-zutaten">
          <span className="fb-titel">Zutaten</span>
          <div className="fb-stapel">
            {zutaten.length === 0 && <span className="fb-nix">Briefkasten leer</span>}
            {zutaten.slice(0, 6).map((p) => (
              <button key={p.video.id} type="button" className="fb-pizza" onClick={() => onPizza(p)} title={p.video.title}>
                <PizzaRund p={p} /><span>{p.video.title}</span>
              </button>
            ))}
            {zutaten.length > 6 && <span className="fb-mehr">+{zutaten.length - 6}</span>}
          </div>
          {teig > 0 && <span className="fb-teig">{teig} × Teig (Ideen ohne Material)</span>}
        </div>

        <span className="fb-pfeil" aria-hidden>›</span>

        {/* Schlange */}
        <div className="fb-station fb-schlange">
          <span className="fb-titel">Bons</span>
          <div className="fb-schiene" aria-hidden />
          <div className="fb-bons">
            {schlange.length === 0 && <span className="fb-nix">kein Bon</span>}
            {schlange.map((p, i) => (
              <button key={p.auftrag?.id ?? p.video.id} type="button" className="fb-bon" style={{ ['--kipp' as any]: `${(i % 3 - 1) * 1.6}deg` }} onClick={() => onPizza(p)} title={p.auftrag?.wunsch ?? p.video.title}>
                <span className="fb-bon-kopf"><b>#{i + 1}</b><span>{p.auftrag?.art === 'aenderung' ? 'ÄNDERUNG' : 'NEU'}</span></span>
                <span className="fb-bon-titel">{p.video.title}</span>
                <span className="fb-bon-kunde">{p.video.clients?.name}</span>
                {p.auftrag?.wunsch && <span className="fb-bon-text">{p.auftrag.wunsch}</span>}
              </button>
            ))}
          </div>
          {!drin && schlange.length > 0 && (
            <button type="button" className="bs-knopf glut klein-glut" onClick={onAnwerfen}><Play size={14} /> Anwerfen</button>
          )}
        </div>

        {/* Ofen-Tunnel */}
        <div className={`fb-ofen ${zustand}`} ref={ofenRef}>
          <span className="bs-glut" aria-hidden />
          <span className="fb-ofen-dach">OFEN</span>
          {drin ? (
            <>
              <button type="button" className="fb-im-ofen" style={{ left: `${prozent}%` }} onClick={() => onPizza(drin)}>
                <PizzaRund p={drin} gross />
              </button>
              <div className="fb-ofen-text">
                <strong>{drin.video.title}</strong>
                <span><Flame size={12} /> {drin.auftrag?.schritt || 'Im Ofen'} · {drin.auftrag?.fortschritt ?? 0} % · seit {seit(drin.auftrag?.gestartet_am ?? drin.auftrag?.created_at)}</span>
              </div>
            </>
          ) : <div className="fb-ofen-text leer"><strong>{schlange.length ? 'Bereit zum Anwerfen' : 'Ofen ist leer'}</strong></div>}
        </div>

        <span className="fb-pfeil" aria-hidden>›</span>

        {/* Ausgabe: zurueck oder weiter */}
        <div className="fb-station fb-ausgabe">
          <span className={`fb-lampe ${raus.length ? 'an' : ''}`} aria-hidden><i /></span>
          <span className="fb-titel">Ausgabe</span>
          <svg className="fb-zurueck" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden>
            <path d="M190 38 C 190 6, 10 6, 10 38" />
            <path d="M4 30 L10 38 L16 30" />
          </svg>
          <span className="fb-zurueck-text">zurück in die Schlange</span>
          <div className="fb-reihe">
            {raus.length === 0 && angebrannt.length === 0 && <span className="fb-nix">nichts draußen</span>}
            {raus.map((p) => (
              <div key={p.video.id} className="fb-raus">
                <button type="button" className="fb-pizza" onClick={() => onChat(p)} title="Im Chat besprechen">
                  <PizzaRund p={p} /><span>{p.video.title}</span>
                </button>
                <div className="fb-raus-knoepfe">
                  <button type="button" className="fb-chat" onClick={() => onChat(p)}><MessageCircle size={14} /> {p.video.chat_url ? 'Chat' : 'Besprechen'}</button>
                  <button type="button" className="fb-servieren" aria-label="Servieren" onClick={() => onServieren(p)}><Check size={15} /></button>
                </div>
              </div>
            ))}
            {angebrannt.map(({ pizza, auftrag }) => (
              <div key={auftrag.id} className="fb-raus angebrannt">
                <button type="button" className="fb-pizza" onClick={() => onPizza(pizza)} title={auftrag.notiz ?? 'angebrannt'}>
                  <PizzaRund p={pizza} /><span>{pizza.video.title}</span>
                </button>
                <button type="button" className="fb-chat" onClick={() => onNochmal(auftrag.id)}><RotateCcw size={14} /> Nochmal</button>
              </div>
            ))}
          </div>
        </div>

        <span className="fb-pfeil" aria-hidden>›</span>

        {/* Teller */}
        <div className="fb-station fb-teller">
          <span className="fb-titel">Teller · zum Posten</span>
          <div className="fb-reihe">
            {teller.length === 0 && <span className="fb-nix">leer</span>}
            {teller.map((p) => (
              <button key={p.video.id} type="button" className="fb-pizza" onClick={() => onPizza(p)} title={p.video.title}>
                <PizzaRund p={p} /><span>{p.video.title}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="fb-pfeil" aria-hidden>›</span>

        {/* Gegessen */}
        <div className="fb-station fb-gegessen">
          <span className="fb-titel">Gegessen</span>
          <b className="fb-gross">{gegessen.length}</b>
          <span className="fb-klein">diesen Monat gepostet</span>
        </div>
       </div>
      </div>
    </section>
  )
}

/* ======================================================================== */

export function PizzaBlatt({ pizza: p, besitzerName, onClose, onKunde, onChat, onZettel, onZurueck, onServieren, onVorne, onHinten, onWeg }: {
  pizza: Pizza
  onChat: () => void
  besitzerName: string | null
  onClose: () => void
  onKunde: () => void
  onZettel: (text: string, vorne: boolean) => Promise<void>
  onZurueck: (text: string, vorne: boolean) => Promise<void>
  onServieren: () => Promise<void>
  onVorne: () => void
  onHinten: () => void
  onWeg: () => Promise<void>
}) {
  const [text, setText] = useState('')
  const [vorne, setVorne] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [film, setFilm] = useState<string | null>(null)
  const [filmFehler, setFilmFehler] = useState<string | null>(null)
  const [zurueck, setZurueck] = useState(false)
  const info = STUFEN.find((s) => s.key === p.stufe)!

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])

  // Vorschau laden, wenn die Pizza raus ist
  useEffect(() => {
    if ((p.stufe !== 'raus' && p.stufe !== 'teller') || !p.video.dropbox_pfad) return
    let weg = false
    const pfad = p.video.dropbox_pfad
    const ziel = /\.mp4$/i.test(pfad) ? pfad : vorschauPfad(pfad)
    dropbox.link(ziel).then((u) => { if (!weg) setFilm(u) }).catch((e) => { if (!weg) setFilmFehler((e as Error).message) })
    return () => { weg = true }
  }, [p.stufe, p.video.dropbox_pfad])

  async function los(f: () => Promise<void>) {
    setLaeuft(true)
    try { await f() } finally { setLaeuft(false) }
  }

  const textFeld = (platzhalter: string) => (
    <>
      <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={platzhalter} />
      <label className="bs-vorne">
        <input type="checkbox" checked={vorne} onChange={(e) => setVorne(e.target.checked)} />
        <span>Vordrängeln – als Nächstes in den Ofen</span>
      </label>
    </>
  )

  return createPortal(
    <div className="bs-blatt-hinter" onMouseDown={onClose}>
      <div className="bs-blatt" role="dialog" aria-label={p.video.title} onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="bs-blatt-zu" aria-label="Schließen" onClick={onClose}><X size={18} /></button>
        <div className="bs-blatt-kopf">
          <PizzaRund p={p} gross ring={p.stufe === 'ofen' ? p.auftrag?.fortschritt ?? 0 : null} />
          <div>
            <span className={`bs-etikett st-${p.stufe}`}>{info.name}</span>
            <h2>{p.video.title}</h2>
            <p>
              {p.video.clients?.name}
              {p.video.scheduled_date ? ` · Posting ${new Date(p.video.scheduled_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
              {besitzerName ? ` · ${besitzerName}s Ofen` : ''}
            </p>
          </div>
        </div>

        {/* Vorschau */}
        {(p.stufe === 'raus' || p.stufe === 'teller') && (
          <div className="bs-film">
            {film ? <video src={film} controls playsInline preload="metadata" />
              : filmFehler ? <span>Keine Vorschau gefunden</span>
              : p.video.dropbox_pfad ? <Loader2 className="spin" /> : <span>Kein Ordner hinterlegt</span>}
          </div>
        )}

        {/* Im Ofen: Stand */}
        {p.stufe === 'ofen' && p.auftrag && (
          <div className="bs-stand">
            <div className="bs-stand-balken"><i style={{ width: `${Math.max(3, p.auftrag.fortschritt ?? 0)}%` }} /></div>
            <p><Flame size={14} /> {p.auftrag.schritt || 'Im Ofen'} · seit {seit(p.auftrag.gestartet_am ?? p.auftrag.created_at)}</p>
            <blockquote>{p.auftrag.wunsch}</blockquote>
          </div>
        )}

        {/* Auf dem Zettel */}
        {p.stufe === 'zettel' && p.auftrag && (
          <div className="bs-stand">
            <blockquote>{p.auftrag.wunsch}</blockquote>
            <div className="bs-knoepfe">
              <button type="button" className="bs-knopf hell" onClick={onVorne}><ArrowUp size={16} /> Vordrängeln</button>
              <button type="button" className="bs-knopf hell" onClick={onHinten}><ArrowDown size={16} /> Hinten anstellen</button>
              <button type="button" className="bs-knopf leise" disabled={laeuft} onClick={() => los(onWeg)}><X size={16} /> Zettel weg</button>
            </div>
          </div>
        )}

        {/* Teig/Belegt: Bestellzettel schreiben */}
        {(p.stufe === 'teig' || p.stufe === 'belegt') && (
          <div className="bs-form">
            {p.stufe === 'teig' && <p className="bs-hinweis">Noch kein Material da. Der Zettel wartet, bis gedreht ist – oder Claude baut aus dem, was es gibt.</p>}
            {(p.video.script || p.video.notes) && (
              <details className="bs-skript">
                <summary>Skript & Notizen</summary>
                <pre>{[p.video.script, p.video.notes].filter(Boolean).join('\n\n')}</pre>
              </details>
            )}
            {textFeld('Bestellzettel: Wie soll es werden? Hook, Länge, Musik, Stil …')}
            <button type="button" className="bs-knopf glut breit" disabled={laeuft || !text.trim()} onClick={() => los(() => onZettel(text, vorne))}>
              {laeuft ? <Loader2 size={16} className="spin" /> : <Flame size={16} />} Auf den Bestellzettel
            </button>
          </div>
        )}

        {/* Raus: servieren oder zurueck */}
        {p.stufe === 'raus' && (
          zurueck ? (
            <div className="bs-form">
              {textFeld('Was soll anders? z. B. Hook kürzer, Musik leiser, Szene bei 0:12 raus …')}
              <div className="bs-knoepfe">
                <button type="button" className="bs-knopf hell" onClick={() => setZurueck(false)}>Abbrechen</button>
                <button type="button" className="bs-knopf glut" disabled={laeuft || !text.trim()} onClick={() => los(() => onZurueck(text, vorne))}>
                  {laeuft ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} Zurück in den Ofen
                </button>
              </div>
            </div>
          ) : (
            <div className="bs-knoepfe gross">
              <button type="button" className="bs-knopf glut" onClick={onChat}><MessageCircle size={18} /> Im Chat besprechen</button>
              <button type="button" className="bs-knopf hell" onClick={() => setZurueck(true)}><RotateCcw size={18} /> Zurück in den Ofen</button>
              <button type="button" className="bs-knopf gruen" disabled={laeuft} onClick={() => los(onServieren)}>
                {laeuft ? <Loader2 size={18} className="spin" /> : <Check size={18} />} Servieren
              </button>
            </div>
          )
        )}

        {/* Teller: nochmal ran */}
        {p.stufe === 'teller' && (
          zurueck ? (
            <div className="bs-form">
              {textFeld('Was soll noch anders?')}
              <button type="button" className="bs-knopf glut breit" disabled={laeuft || !text.trim()} onClick={() => los(() => onZettel(text, vorne))}>
                <RotateCcw size={16} /> Zurück in den Ofen
              </button>
            </div>
          ) : (
            <button type="button" className="bs-knopf hell breit" onClick={() => setZurueck(true)}><RotateCcw size={16} /> Doch nochmal ändern</button>
          )
        )}

        <button type="button" className="bs-link" onClick={onKunde}>Video in der Kundenakte öffnen <ChevronRight size={15} /></button>
      </div>
    </div>,
    document.body,
  )
}
