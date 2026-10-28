// Backstube -- die Ofen-Seite (Fassie, 28.10.2026)
// Eigene Vollbild-Seite ohne Leiste: der Arbeitsmodus fuer die Produktion.
// Oben die Oefen (einer pro Person), darunter was rauskommt, was auf dem
// Teller liegt, belegte Pizzen, Teig und die Bestellungen pro Kunde.
// Logik: lib/backstube.ts. Live per Realtime.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Flame, Loader2, Play, RotateCcw, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIdentity } from '../context/IdentityContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from '../context/ToastContext'
import { automatikAnstossen } from '../lib/automatik'
import { dropbox } from '../lib/medien'
import { aendern, fertigMachen, vorschauPfad, type PruefVideo } from '../lib/freigabe'
import {
  STUFEN, aufDenZettel, hintenAnstellen, ladeBackstube, nochmalBacken, seit, vordraengeln, zettelWeg,
  type Backstube, type OfenStand, type Pizza, type Stufe,
} from '../lib/backstube'
import '../styles/backstube.css'

type Sicht = 'alle' | 'meins'

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
  const warte = useRef<number | null>(null)

  const team = useMemo(() => members.filter((m) => m.active !== false), [members])
  const teamIds = useMemo(() => team.map((m) => m.id).join(','), [team])

  const laden = useCallback(async () => {
    if (!teamIds) return
    try { setDaten(await ladeBackstube(teamIds.split(','))); setFehler(null) }
    catch (e) { setFehler((e as Error).message) }
  }, [teamIds])

  useEffect(() => { laden() }, [laden])
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

  const sichtbar = (b: string | null) => sicht === 'alle' || !memberId || b === memberId
  const pizzenIn = (s: Stufe) => (daten?.pizzen ?? []).filter((p) => p.stufe === s && sichtbar(p.besitzer))
  const oefen = team
    .filter((m) => sichtbar(m.id))
    .sort((a, b) => (a.id === memberId ? -1 : 0) - (b.id === memberId ? -1 : 0))
    .map((m) => ({ m, stand: daten?.oefen.get(m.id) }))

  const teller = pizzenIn('teller')
  const belegt = pizzenIn('belegt')
  const teig = pizzenIn('teig')
  const jetzt = new Date()

  return (
    <div className="bs">
      <header className="bs-kopf">
        <button type="button" className="bs-rund" aria-label="Zurück" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft strokeWidth={2.2} />
        </button>
        <div className="bs-titel">
          <span className="bs-ueber">{jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>Backstube</h1>
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
          {/* ------------------------------------------------------- Oefen */}
          <section className={`bs-oefen n${oefen.length}`}>
            {oefen.map(({ m, stand }) => (
              <OfenTuer
                key={m.id}
                name={m.id === memberId ? 'Dein Ofen' : `${m.name}s Ofen`}
                farbe={m.color}
                stand={stand}
                naechsteBelegte={pizzenIn('belegt').find((p) => p.besitzer === m.id) ?? null}
                onPizza={setOffen}
                onAnwerfen={() => tun(Promise.resolve(), 'Ofen wird angeworfen', `Backstube: ${m.name}s Ofen anwerfen`)}
                onVorne={(p) => tun(vordraengeln(p.auftrag!.id), 'Vorgedrängelt')}
                onHinten={(p) => tun(hintenAnstellen(p.auftrag!.id), 'Hinten angestellt')}
                onNochmal={(id) => tun(nochmalBacken(id), 'Wieder angestellt', 'Backstube: angebrannte Pizza nochmal')}
              />
            ))}
          </section>

          {/* --------------------------------------------------- Teller */}
          <Reihe stufe="teller" pizzen={teller} onPizza={setOffen} leer="Noch nichts auf dem Teller" />

          {/* ------------------------------------------------- Belegt */}
          <Reihe stufe="belegt" pizzen={belegt} onPizza={setOffen} leer="Kein belegtes Material – Drehtag abschließen bringt Nachschub" />

          {/* --------------------------------------------------- Teig */}
          <Reihe stufe="teig" pizzen={teig} onPizza={setOffen} leer="Kein Teig – keine offenen Ideen" klein />

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
  )
}

function alsPruef(p: Pizza): PruefVideo {
  return {
    id: p.video.id, title: p.video.title, client_id: p.video.client_id, dropbox_pfad: p.video.dropbox_pfad ?? null,
    produktion_stufe: p.video.produktion_stufe ?? null, bearbeiter_id: p.video.bearbeiter_id ?? null,
    clients: p.video.clients ? { name: p.video.clients.name, logo_url: p.video.clients.logo_url, zustaendig_id: p.video.clients.zustaendig_id } : null,
  }
}

/* ======================================================================== */

function PizzaRund({ p, gross, ring }: { p: Pizza; gross?: boolean; ring?: number | null }) {
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
      <span className="bs-pizza-mitte">
        {c?.logo_url ? <img src={c.logo_url} alt="" /> : <span>{(c?.name ?? '?').slice(0, 1)}</span>}
      </span>
    </span>
  )
}

export function OfenTuer({ name, farbe, stand, naechsteBelegte, onPizza, onAnwerfen, onVorne, onHinten, onNochmal }: {
  name: string
  farbe: string
  stand?: OfenStand
  naechsteBelegte: Pizza | null
  onPizza: (p: Pizza) => void
  onAnwerfen: () => void
  onVorne: (p: Pizza) => void
  onHinten: (p: Pizza) => void
  onNochmal: (auftragId: string) => void
}) {
  const drin = stand?.imOfen ?? null
  const schlange = stand?.schlange ?? []
  const raus = stand?.raus ?? []
  const angebrannt = stand?.angebrannt ?? []
  const zustand = drin ? 'an' : schlange.length ? 'wartet' : 'leer'

  return (
    <article className="bs-ofen">
      <div className="bs-ofen-name">
        <i style={{ background: farbe }} />
        <h2>{name}</h2>
        <span className={`bs-zustand z-${zustand}`}>
          {zustand === 'an' ? 'backt' : zustand === 'wartet' ? 'wartet auf Start' : 'leer'}
        </span>
      </div>

      {/* Die Ofenoeffnung */}
      <div className={`bs-mund ${zustand}`}>
        <span className="bs-glut" aria-hidden />
        <span className="bs-funken" aria-hidden><i /><i /><i /><i /><i /></span>
        {drin ? (
          <button type="button" className="bs-drin" onClick={() => onPizza(drin)}>
            <PizzaRund p={drin} gross ring={drin.auftrag?.fortschritt ?? 0} />
            <span className="bs-drin-text">
              <span className="bs-drin-titel">{drin.video.title}</span>
              <span className="bs-drin-unter">{drin.video.clients?.name} · seit {seit(drin.auftrag?.gestartet_am ?? drin.auftrag?.created_at)}</span>
              <span className="bs-drin-schritt">
                <Flame size={14} /> {drin.auftrag?.schritt || 'Im Ofen'}
                {drin.auftrag?.fortschritt != null && <b>{drin.auftrag.fortschritt} %</b>}
              </span>
            </span>
          </button>
        ) : schlange.length ? (
          <div className="bs-leer">
            <span>Nächste Pizza liegt bereit</span>
            <button type="button" className="bs-knopf glut" onClick={onAnwerfen}><Play size={16} /> Ofen anwerfen</button>
          </div>
        ) : (
          <div className="bs-leer">
            <span className="bs-leer-gross">Ofen ist leer</span>
            {naechsteBelegte ? (
              <button type="button" className="bs-knopf hell" onClick={() => onPizza(naechsteBelegte)}>
                {naechsteBelegte.video.title} reinschieben <ChevronRight size={16} />
              </button>
            ) : <span className="bs-leer-klein">Kein belegtes Material – Zeit für einen Drehtag</span>}
          </div>
        )}
      </div>

      {/* Bestellzettel vor dem Ofen */}
      <div className="bs-zettel">
        <div className="bs-abschnitt"><span>Bestellzettel</span><b>{schlange.length}</b></div>
        {schlange.length === 0 ? (
          <p className="bs-nix">Keine Pizza wartet. Tipp eine belegte Pizza an und schreib den Zettel.</p>
        ) : (
          <ol>
            {schlange.map((p, i) => (
              <li key={p.auftrag!.id}>
                <span className="bs-platz">{i + 1}</span>
                <button type="button" className="bs-zeile" onClick={() => onPizza(p)}>
                  <PizzaRund p={p} />
                  <span className="bs-zeile-text">
                    <span className="bs-zeile-titel">{p.video.title}</span>
                    <span className="bs-zeile-unter">{p.auftrag!.art === 'aenderung' ? 'Änderung' : 'Erster Schnitt'} · {p.auftrag!.wunsch}</span>
                  </span>
                </button>
                {p.stufe === 'zettel' && (
                  <span className="bs-pfeile">
                    <button type="button" aria-label="Vordrängeln" disabled={i === 0} onClick={() => onVorne(p)}><ArrowUp size={16} strokeWidth={2.4} /></button>
                    <button type="button" aria-label="Hinten anstellen" disabled={i === schlange.length - 1} onClick={() => onHinten(p)}><ArrowDown size={16} strokeWidth={2.4} /></button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Raus aus dem Ofen: entscheiden */}
      {(raus.length > 0 || angebrannt.length > 0) && (
        <div className="bs-raus">
          <div className="bs-abschnitt"><span>Raus aus dem Ofen</span><b>{raus.length + angebrannt.length}</b></div>
          <div className="bs-raus-reihe">
            {raus.map((p) => (
              <button key={p.video.id} type="button" className="bs-raus-pizza" onClick={() => onPizza(p)}>
                <PizzaRund p={p} />
                <span className="bs-raus-titel">{p.video.title}</span>
              </button>
            ))}
            {angebrannt.map(({ pizza, auftrag }) => (
              <div key={auftrag.id} className="bs-raus-pizza angebrannt">
                <PizzaRund p={pizza} />
                <span className="bs-raus-titel">{pizza.video.title}</span>
                <small>{auftrag.notiz || 'angebrannt'}</small>
                <button type="button" className="bs-knopf klein" onClick={() => onNochmal(auftrag.id)}><RotateCcw size={14} /> Nochmal</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

export function Reihe({ stufe, pizzen, onPizza, leer, klein }: {
  stufe: Stufe
  pizzen: Pizza[]
  onPizza: (p: Pizza) => void
  leer: string
  klein?: boolean
}) {
  const info = STUFEN.find((s) => s.key === stufe)!
  return (
    <section className={`bs-theke ${klein ? 'klein' : ''}`}>
      <div className="bs-theke-kopf">
        <h2><i className={`st-${stufe}`} />{info.name}</h2>
        <span>{pizzen.length} · {info.satz}</span>
      </div>
      {pizzen.length === 0 ? <p className="bs-nix">{leer}</p> : (
        <div className="bs-band">
          {pizzen.map((p) => (
            <button key={p.video.id} type="button" className="bs-band-pizza" onClick={() => onPizza(p)}>
              <PizzaRund p={p} />
              <span className="bs-band-titel">{p.video.title}</span>
              <span className="bs-band-unter">
                {p.video.clients?.name}
                {p.video.scheduled_date ? ` · ${new Date(p.video.scheduled_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ======================================================================== */

export function PizzaBlatt({ pizza: p, besitzerName, onClose, onKunde, onZettel, onZurueck, onServieren, onVorne, onHinten, onWeg }: {
  pizza: Pizza
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
