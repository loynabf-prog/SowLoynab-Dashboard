// Das Spiel -- eigene Web-App unter /spiel/. Gleiche Anmeldung wie das CRM,
// gleiche Daten. Das Dorf fuellt den ganzen Bildschirm (wie ein Aufbauspiel);
// Anzeigen liegen in den Ecken, Quests/Ziele/Bilanz legen sich als Tafeln
// darueber. Echte Arbeit laesst XP-Blasen entstehen, die man einsammelt.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Trophy, ListChecks, BarChart3, Lock, Check, Plus, X, RefreshCw, Sparkles, ExternalLink, RotateCcw, ArrowUpRight, Euro, Gift, Users, Video, CalendarPlus, UserPlus, Coffee, Trash2, ChevronLeft, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { AUSSTATTUNG, LEVEL, MEILENSTEINE, XP, ZIEL_TYPEN, beuteOffen, beuteOrt, etagenStand, kurzZahl, levelFuer, monatName, type EtageStand, type FollowerStand, type SQuest, type ZielStand, type ZielTyp } from '../lib/spiel'
import { setBetriebFrage, ABGEBROCHEN } from '../lib/betriebWahl'
import type { Channel } from '../lib/channels'
import type { Empfehlung } from '../lib/pilot'
import { auftragXp, beuteSammeln, kundeAnlegen, ladeSpiel, leadAnlegen, questAnlegen, questErledigen, questZurueck, terminAnlegen, videoGepostet, zielAnlegen, zielEinloesen, zielLoeschen, type SpielDaten, type StudioKunde } from './daten'
import Welt, { type Ansicht } from './Welt'
import './spiel.css'

type Reiter = 'studio' | 'quests' | 'ziele' | 'bilanz'
type Plus = 'menue' | 'video' | 'quest' | 'kunde' | 'termin'

const euro = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`

/** Zahl, die hochzaehlt, wenn sie sich aendert. */
function useZaehler(ziel: number, dauer = 1100): number {
  const [wert, setWert] = useState(ziel)
  const von = useRef(ziel)
  useEffect(() => {
    const start = performance.now(), a = von.current
    if (a === ziel) return
    let raf = 0
    const tick = (t: number) => {
      const x = Math.min(1, (t - start) / dauer), e = 1 - Math.pow(1 - x, 3)
      setWert(a + (ziel - a) * e)
      if (x < 1) raf = requestAnimationFrame(tick); else von.current = ziel
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ziel, dauer])
  return wert
}

export default function SpielApp() {
  const [angemeldet, setAngemeldet] = useState<boolean | null>(null)
  const [daten, setDaten] = useState<SpielDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [reiter, setReiter] = useState<Reiter>('studio')
  const [gewaehlt, setGewaehlt] = useState<string | null>(() => new URLSearchParams(location.search).get('stueck'))
  const [meldung, setMeldung] = useState<string | null>(null)
  const [nacht, setNacht] = useState(() => { const h = new Date().getHours(); return h >= 18 || h < 7 })
  const [plus, setPlus] = useState<Plus | null>(null)
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (new URLSearchParams(location.search).get('stueck') ? 'haus' : 'dorf'))
  // Beute: lokal schon eingesammelt (laeuft dem Server voraus), fliegende XP, Level-Aufstieg, Einfuehrung
  const [gesammelt, setGesammelt] = useState<Record<string, number> | null>(null)
  const [flieger, setFlieger] = useState<{ id: number; x: number; y: number; xp: number }[]>([])
  const [aufstieg, setAufstieg] = useState<number | null>(null)
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem('spiel-intro') } catch { return true } })
  const xpZiel = useRef<HTMLDivElement>(null)
  // Kunde mit zwei Betrieben (Schleckofatz/Schmackofatz): "Gepostet" fragt nach, welcher.
  const [betriebe, setBetriebe] = useState<{ kanaele: Channel[]; fertig: (id: string | undefined) => void } | null>(null)
  useEffect(() => {
    setBetriebFrage((kanaele) => new Promise((fertig) => setBetriebe({ kanaele, fertig })))
    return () => setBetriebFrage(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAngemeldet(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAngemeldet(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const laden = useCallback(async () => {
    try { setDaten(await ladeSpiel()); setGesammelt(null); setFehler(null) } catch (e) { setFehler((e as Error).message) }
  }, [])
  useEffect(() => { if (angemeldet) laden() }, [angemeldet, laden])
  // Frisch bleiben: beim Zurueckkommen in die App und alle zwei Minuten neu laden -- so tauchen neue Blasen auf.
  useEffect(() => {
    if (!angemeldet) return
    const neu = () => { if (document.visibilityState === 'visible') laden() }
    document.addEventListener('visibilitychange', neu)
    const takt = window.setInterval(neu, 120_000)
    return () => { document.removeEventListener('visibilitychange', neu); window.clearInterval(takt) }
  }, [angemeldet, laden])

  function sag(t: string) { setMeldung(t); window.setTimeout(() => setMeldung(null), 2600) }

  /** "Video gepostet" -- traegt es echt im CRM ein (Platzhalter fuellen, Link und Zahlen holen). */
  async function posten(clientId: string, name: string, eigen: boolean): Promise<boolean> {
    const fehlerText = await videoGepostet(clientId)
    if (fehlerText) { if (fehlerText !== ABGEBROCHEN) sag('Ging nicht: ' + fehlerText); return false }
    celebrate()
    sag(`+${eigen ? XP.eigenesVideo : XP.video} XP · ${name} gepostet`)
    await laden()
    return true
  }

  const s = daten?.stand
  const etagen = useMemo(() => (daten ? etagenStand(daten.stand) : []), [daten])

  // ---- Beute: verdient ist, was die echten Daten sagen; angezeigt wird, was schon eingesammelt ist.
  const laeden = useMemo(() => (daten ? daten.leben.kunden.slice(0, 8).map((k) => k.id) : []), [daten])
  const offen = useMemo(() => (daten ? beuteOffen(daten.beuteJetzt, gesammelt ?? daten.beuteGesammelt) : []), [daten, gesammelt])
  const beuteJeOrt = useMemo(() => {
    const aus: Record<string, number> = {}
    for (const b of offen) { const ort = beuteOrt(b.key, laeden); aus[ort] = (aus[ort] ?? 0) + b.xp }
    return aus
  }, [offen, laeden])
  const offenSumme = offen.reduce((a, b) => a + b.xp, 0)
  const xpGezeigt = s ? s.xp - offenSumme : 0
  const lv = levelFuer(xpGezeigt)
  const xpZahl = useZaehler(xpGezeigt, 700)

  function sammeln(ort: string, wo: { x: number; y: number }) {
    if (!daten) return
    const teile = offen.filter((b) => beuteOrt(b.key, laeden) === ort)
    const xp = teile.reduce((a, b) => a + b.xp, 0)
    if (!xp) return
    const vorher = levelFuer(xpGezeigt).level.nr
    const neu: Record<string, number> = {}
    for (const b of teile) neu[b.key] = daten.beuteJetzt[b.key]
    const id = Date.now() + Math.random()
    setFlieger((f) => [...f, { id, x: wo.x, y: wo.y, xp }])
    window.setTimeout(() => {
      setFlieger((f) => f.filter((x) => x.id !== id))
      setGesammelt((g) => ({ ...(g ?? daten.beuteGesammelt), ...neu }))
      const nachher = levelFuer(xpGezeigt + xp).level
      if (nachher.nr > vorher) { setAufstieg(nachher.nr); celebrate() }
    }, 650)
    beuteSammeln(neu).catch(() => { /* beim naechsten Laden liegt die Blase wieder da */ })
  }

  const panelTitel: Record<Exclude<Reiter, 'studio'>, string> = { quests: 'Quests', ziele: 'Ziele', bilanz: 'Bilanz' }
  const zielBereit = !!s && s.ziele.some((z) => z.erreicht && !z.eingeloest)
  const offeneQuests = s ? s.quests.filter((q) => q.status === 'offen' && !q.gesperrt).length : 0

  if (angemeldet === false) {
    return (
      <div className="sp-login">
        <div className="sp-logo">S&amp;L</div>
        <h1>Das Dorf</h1>
        <p>Melde dich einmal im CRM an — dann bist du auch hier drin.</p>
        <a className="sp-knopf" href="/">Zum CRM</a>
      </div>
    )
  }

  return (
    <div className={`sp dorf ${nacht ? 'nacht' : ''}`}>
      {fehler && <p className="sp-fehler wl-fehler">{fehler}</p>}
      {!daten && !fehler && <div className="sp-lade">Das Dorf wacht auf …</div>}

      {daten && s && (
        <>
          <Welt
            ansicht={ansicht} onAnsicht={(x) => { setGewaehlt(null); setAnsicht(x) }} etagen={etagen}
            level={lv.level} nacht={nacht} leben={daten.leben} hits={s.hits.length} offeneQuests={offeneQuests}
            gewaehlt={gewaehlt} onWaehlen={setGewaehlt} onFrei={() => setPlus('kunde')}
            onOrt={(r) => { setGewaehlt(null); setReiter(r) }} follower={s.follower} umsatzMonat={s.umsatz.gestellt}
            zielBereit={zielBereit} beute={beuteJeOrt} onSammeln={sammeln}
          />

          {/* ---- Anzeigen: liegen in den Ecken ueber dem Dorf ---- */}
          <div className="hud hud-ol">
            <div className="hud-level" ref={xpZiel}>
              <span className="sp-level-nr">{lv.level.nr}</span>
              <div>
                <strong>{lv.level.name}</strong>
                <div className="sp-xp"><i style={{ width: `${lv.fortschritt * 100}%` }} /></div>
                <small>{Math.round(xpZahl).toLocaleString('de-DE')}{lv.naechstes ? ` / ${lv.naechstes.ab.toLocaleString('de-DE')}` : ''} XP</small>
              </div>
            </div>
            <div className="hud-zeile">
              <span className={`wl-pille ${s.heuteGepostet ? 'glut' : ''}`} title="Posting-Streak"><Flame strokeWidth={2.4} /><b>{s.streak}</b></span>
              {daten.heuteVideos > 0 && <span className="wl-pille"><Video strokeWidth={2.4} /> heute <b>{daten.heuteVideos}</b></span>}
              {ansicht === 'haus'
                ? <button className="wl-pille wl-zurueck" onClick={() => { setGewaehlt(null); setAnsicht('dorf') }}><ChevronLeft strokeWidth={2.6} /> Dorf</button>
                : s.ort === 'cafe' && s.bueroIn != null && <span className="wl-pille"><Coffee strokeWidth={2.2} /> Büro in <b>{s.bueroIn}</b> {s.bueroIn === 1 ? 'Tag' : 'Tagen'}</span>}
            </div>
          </div>

          <div className="hud hud-or">
            <button className="wl-pille gross" onClick={() => setReiter('bilanz')} aria-label="Umsatz diesen Monat"><Euro strokeWidth={2.4} /><b>{Math.round(s.umsatz.gestellt).toLocaleString('de-DE')}</b></button>
            <button className="wl-pille gross" onClick={() => setReiter('ziele')} aria-label="Follower"><Users strokeWidth={2.4} /><b>{s.follower.gesamt.toLocaleString('de-DE')}</b></button>
            <div className="hud-zeile rechts">
              <button className="sp-rund" onClick={() => setIntro(true)} aria-label="Einführung">?</button>
              <button className="sp-rund" onClick={() => setNacht((n) => !n)} aria-label="Tag/Nacht">{nacht ? '☾' : '☀'}</button>
              <button className="sp-rund" onClick={laden} aria-label="Aktualisieren"><RefreshCw strokeWidth={2.2} /></button>
            </div>
          </div>

          <div className="hud hud-ul">
            <button className="hud-knopf" onClick={() => setReiter('quests')}><ListChecks strokeWidth={2.2} /><span>Quests</span>{offeneQuests > 0 && <i>{offeneQuests}</i>}</button>
            <button className="hud-knopf" onClick={() => setReiter('ziele')}><Gift strokeWidth={2.2} /><span>Ziele</span>{zielBereit && <i>!</i>}</button>
            <button className="hud-knopf" onClick={() => setReiter('bilanz')}><BarChart3 strokeWidth={2.2} /><span>Bilanz</span></button>
          </div>

          <div className="hud hud-ur">
            <button className="hud-plus" onClick={() => setPlus('menue')} aria-label="Eintragen"><Plus strokeWidth={3} /><span>Eintragen</span></button>
          </div>

          <div className="hud hud-um">
            {gewaehlt?.startsWith('kunde:')
              ? <KundenKarte k={daten.leben.kunden.find((x) => `kunde:${x.id}` === gewaehlt)} onZu={() => setGewaehlt(null)} onPosten={(k) => posten(k.id, k.name, false)} />
              : gewaehlt
                ? <StueckKarte schluessel={gewaehlt} levelNr={s.level.nr} onZu={() => setGewaehlt(null)} onReiter={(r) => { setGewaehlt(null); setReiter(r) }} />
                : offenSumme > 0 && ansicht === 'dorf' && <div className="wl-tipp">{offenSumme.toLocaleString('de-DE')} XP liegen im Dorf — antippen und einsammeln</div>}
          </div>

          <div className="wl-dreh">Quer gehalten sieht man mehr ↻</div>

          {/* ---- Tafeln: Quests, Ziele, Bilanz legen sich ueber das Dorf ---- */}
          {reiter !== 'studio' && (
            <div className="wl-tafel-hinter" onClick={() => setReiter('studio')}>
              <div className="wl-tafel" onClick={(e) => e.stopPropagation()}>
                <header><strong>{panelTitel[reiter]}</strong><button onClick={() => setReiter('studio')} aria-label="Schließen"><X strokeWidth={2.4} /></button></header>
                <div className="wl-tafel-inhalt">
                  {reiter === 'quests' && <Quests quests={s.quests} levelNr={s.level.nr} auftraege={daten.auftraege} onNeu={laden} sag={sag} />}
                  {reiter === 'ziele' && <Ziele ziele={s.ziele} f={s.follower} onNeu={laden} sag={sag}
                    bauplan={<Bauplan etagen={etagen} levelName={lv.level.name} satz={lv.level.satz} onRein={() => { setAnsicht('haus'); setReiter('studio') }} />} />}
                  {reiter === 'bilanz' && <Bilanz d={daten} />}
                </div>
              </div>
            </div>
          )}

          {/* ---- fliegende XP ---- */}
          {flieger.map((f) => {
            const r = xpZiel.current?.getBoundingClientRect()
            const zx = r ? r.left + 24 : 30, zy = r ? r.top + 24 : 30
            return <div key={f.id} className="wl-flieger" style={{ left: f.x, top: f.y, ['--dx' as string]: `${zx - f.x}px`, ['--dy' as string]: `${zy - f.y}px` }}>+{f.xp.toLocaleString('de-DE')}</div>
          })}

          {aufstieg != null && (
            <div className="wl-aufstieg" onClick={() => setAufstieg(null)}>
              <div>
                <small>Level geschafft</small>
                <span className="sp-level-nr">{aufstieg}</span>
                <strong>{LEVEL[aufstieg]?.name}</strong>
                <p>{LEVEL[aufstieg]?.satz}</p>
                <button className="sp-knopf" onClick={() => setAufstieg(null)}>Weiter</button>
              </div>
            </div>
          )}

          {intro && <Einfuehrung d={daten} etagen={etagen} onZu={() => { setIntro(false); try { localStorage.setItem('spiel-intro', '1') } catch { /* egal */ } }} />}
        </>
      )}

      {daten && plus && plus !== 'quest' && (
        <Eintragen art={plus} setArt={setPlus} d={daten} onZu={() => setPlus(null)} onPosten={posten} onFertig={() => { setPlus(null); laden() }} sag={sag} />
      )}
      {plus === 'quest' && <NeueQuest onZu={() => setPlus(null)} onFertig={() => { setPlus(null); laden() }} sag={sag} />}
      {betriebe && (
        <div className="sp-sheet-hinter" style={{ zIndex: 80 }} onClick={() => { betriebe.fertig(undefined); setBetriebe(null) }}>
          <div className="sp-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sp-sheet-kopf"><strong>Welcher Betrieb?</strong><button onClick={() => { betriebe.fertig(undefined); setBetriebe(null) }} aria-label="Schließen"><X strokeWidth={2.2} /></button></div>
            <div className="sp-wahl">
              {betriebe.kanaele.map((c) => <button key={c.id} onClick={() => { betriebe.fertig(c.id); setBetriebe(null) }}><i style={{ background: c.color }} />{c.name}</button>)}
            </div>
          </div>
        </div>
      )}
      {meldung && <div className="sp-toast">{meldung}</div>}
    </div>
  )
}

// ----------------------------------------------------------- Einführung
// Einmal beim ersten Start (und jederzeit ueber das Fragezeichen): woher die
// Agentur kommt, wo sie steht, wie das Dorf funktioniert, wohin es geht.
// Alle Zahlen kommen aus dem CRM.
function Einfuehrung({ d, etagen, onZu }: { d: SpielDaten; etagen: EtageStand[]; onZu: () => void }) {
  const [i, setI] = useState(0)
  const s = d.stand, g = d.geschichte
  const monat = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const naechste = etagen.find((e) => !e.frei)
  const zahlend = d.leben.kunden.length
  const seiten: { ueber: string; titel: string; inhalt: React.ReactNode }[] = [
    {
      ueber: g.erstesVideo ? monat(g.erstesVideo) : 'Der Anfang', titel: 'So fing es an',
      inhalt: <p>Zwei Leute, ein Handy, kein Büro. {g.erstesVideo ? <>Das erste Video in eurem CRM ist vom <b>{monat(g.erstesVideo)}</b>.</> : null} Am <b>1. August 2026</b> wurde daraus die Sow &amp; Loynab Media GbR.</p>,
    },
    {
      ueber: 'Eure Kunden', titel: 'Einer nach dem anderen',
      inhalt: (
        <ol className="wl-intro-liste">
          {g.kunden.slice(0, 9).map((k) => <li key={k.name}><span>{k.name}</span><small>{monat(k.seit)} · {k.videos} Videos</small></li>)}
        </ol>
      ),
    },
    {
      ueber: 'Bis heute', titel: 'Das habt ihr schon gebaut',
      inhalt: (
        <div className="wl-intro-zahlen">
          <div><strong>{g.videos.toLocaleString('de-DE')}</strong><small>Videos gepostet</small></div>
          <div><strong>{kurzZahl(g.views)}</strong><small>Views</small></div>
          <div><strong>{s.hits.length}</strong><small>Hits</small></div>
          <div><strong>{s.umsatz.bester ? euro(s.umsatz.bester.betrag) : '–'}</strong><small>bester Monat</small></div>
          <div><strong>{s.follower.gesamt.toLocaleString('de-DE')}</strong><small>Follower @sowloynab</small></div>
          <div><strong>Level {s.level.nr}</strong><small>{s.level.name}</small></div>
        </div>
      ),
    },
    {
      ueber: 'So geht das Spiel', titel: 'Das Dorf ist eure Agentur',
      inhalt: (
        <ul className="wl-intro-punkte">
          <li><b>In der Mitte steht ihr.</b> Antippen führt ins Haus: jede Etage ein Raum, jedes Möbelstück ein Knopf ins CRM.</li>
          <li><b>Jeder Laden ist ein Kunde.</b> Der Ring zeigt die Videos diesen Monat, die Zahl daneben die Stufe. Läden wachsen mit jedem Video.</li>
          <li><b>Dahinter:</b> Sendeturm (Follower), Bank (Umsatz), Backstube (Schnitt), Kalender. Vorn: Quests und die Truhe mit euren Zielen.</li>
          <li><b>Ziehen</b> verschiebt die Karte, <b>zwei Finger</b> zoomen.</li>
        </ul>
      ),
    },
    {
      ueber: 'So geht das Spiel', titel: 'Echte Arbeit, echte Punkte',
      inhalt: (
        <ul className="wl-intro-punkte">
          <li><span className="wl-beute klein">+150<small>XP</small></span> Postet ihr drei Videos, liegen drei mal 50 XP über dem Laden. <b>Antippen sammelt sie ein.</b></li>
          <li>Auch bezahlte Rechnungen, neue Follower, erledigte Quests und Hits werden zu Blasen.</li>
          <li>Der <b>Plus-Knopf</b> unten rechts trägt ein: Video gepostet, Quest, Kunde, Termin. Alles landet direkt im CRM.</li>
          <li>Punkte gibt es nur für Echtes. Was nicht passiert ist, zählt nicht.</li>
        </ul>
      ),
    },
    {
      ueber: 'Ab hier', titel: 'Wohin es geht',
      inhalt: (
        <ul className="wl-intro-punkte">
          {naechste && <li><b>Nächste Etage: {naechste.etage.name}</b> · {naechste.text}</li>}
          {s.naechstes && <li><b>Nächstes Level: {s.naechstes.name}</b> · noch {(s.naechstes.ab - s.xp).toLocaleString('de-DE')} XP</li>}
          <li><b>{zahlend} Läden stehen.</b> Das freie Grundstück wartet auf den nächsten Kunden.</li>
          <li>Mehr Kunden, mehr Umsatz, irgendwann Mitarbeiter: Das Dorf wächst nur, wenn die Agentur wächst.</li>
        </ul>
      ),
    },
  ]
  const seite = seiten[i]
  const letzte = i === seiten.length - 1
  return (
    <div className="wl-intro">
      <div className="wl-intro-karte">
        <button className="wl-intro-zu" onClick={onZu} aria-label="Überspringen"><X strokeWidth={2.4} /></button>
        <small>{seite.ueber}</small>
        <h2>{seite.titel}</h2>
        <div className="wl-intro-inhalt">{seite.inhalt}</div>
        <footer>
          <span className="wl-intro-punkt">{seiten.map((_, j) => <i key={j} className={j === i ? 'an' : ''} />)}</span>
          {i > 0 && <button className="sp-leise" onClick={() => setI(i - 1)}>Zurück</button>}
          <button className="sp-knopf" onClick={() => (letzte ? onZu() : setI(i + 1))}>{letzte ? 'Los geht’s' : 'Weiter'}</button>
        </footer>
      </div>
    </div>
  )
}

// -------------------------------------------------------- Stück-Karte
function StueckKarte({ schluessel, onZu, onReiter }: { schluessel: string | null; levelNr: number; onZu: () => void; onReiter: (r: Reiter) => void }) {
  const a = AUSSTATTUNG.find((x) => x.key === schluessel)
  if (!a) return null
  // Im Haus steht nur, was freigeschaltet ist -- gesperrt wird ueber die Etage, nicht ueber das Stueck.
  const gesperrt = false
  const level = LEVEL[a.abLevel]
  const ziel = a.ziel
  return (
    <div className="st-karte">
      <div className="st-karte-text">
        <strong>{a.name}</strong>
        <p>{gesperrt ? `Kommt mit Level ${a.abLevel} · ${level?.name ?? ''}. ${a.tut}` : a.tut}</p>
      </div>
      {gesperrt ? <span className="sp-schloss"><Lock strokeWidth={2.2} /></span>
        : ziel.art === 'crm'
          ? <a className="st-los" href={ziel.pfad} target="_blank" rel="noopener">Öffnen <ArrowUpRight strokeWidth={2.4} /></a>
          : <button className="st-los" onClick={() => onReiter(ziel.reiter)}>Ansehen <ArrowUpRight strokeWidth={2.4} /></button>}
      <button className="st-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
    </div>
  )
}

// --------------------------------------------------------------- Bauplan
function Bauplan({ etagen, levelName, satz, onRein }: { etagen: EtageStand[]; levelName: string; satz: string; onRein: () => void }) {
  const naechste = etagen.find((e) => !e.frei)
  return (
    <section className="sp-karte sp-bauplan">
      <div className="sp-karte-kopf"><Building2 strokeWidth={2.2} /><strong>Das Haus · {levelName}</strong><button className="sp-klein" onClick={onRein}>Reingehen</button></div>
      <p>{satz}</p>
      <ol>
        {[...etagen].reverse().map((e) => (
          <li key={e.etage.key} className={e.frei ? 'steht' : e === naechste ? 'bau' : 'spaeter'}>
            <i style={{ background: e.etage.farbe }} />
            <span><strong>{e.etage.name}</strong><small>{e.frei ? e.etage.satz : e.text}</small></span>
            {e.frei ? <Check strokeWidth={3} /> : e === naechste ? <b>{Math.round(e.fortschritt * 100)} %</b> : <Lock strokeWidth={2.2} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------- Kunden-Karte
function KundenKarte({ k, onZu, onPosten }: { k: StudioKunde | undefined; onZu: () => void; onPosten: (k: StudioKunde) => Promise<boolean> }) {
  const [laeuft, setLaeuft] = useState(false)
  if (!k) return null
  return (
    <div className="st-karte st-kunde">
      <div className="st-karte-text">
        <strong>{k.name}</strong>
        <p>{k.ziel > 0 ? `${k.gepostet} von ${k.ziel} Videos diesen Monat` : `${k.gepostet} Videos diesen Monat`}{k.satz ? ` · ${k.satz}` : ''}</p>
        {k.ziel > 0 && <div className="st-kunde-balken"><i style={{ width: `${Math.min(100, Math.round((k.gepostet / k.ziel) * 100))}%` }} /></div>}
        <div className="st-kunde-knoepfe">
          <button className="st-los" disabled={laeuft} onClick={async () => { setLaeuft(true); try { await onPosten(k) } finally { setLaeuft(false) } }}><Video strokeWidth={2.4} /> Video gepostet</button>
          <a className="st-leise" href={`/client/${k.id}`} target="_blank" rel="noopener">Akte <ArrowUpRight strokeWidth={2.4} /></a>
        </div>
      </div>
      <button className="st-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
    </div>
  )
}

// -------------------------------------------------------- Follower-Karte
function FollowerKarte({ f, onMehr }: { f: FollowerStand; onMehr?: () => void }) {
  const gesamt = useZaehler(f.gesamt)
  return (
    <section className="sp-karte sp-follower" onClick={onMehr} role={onMehr ? 'button' : undefined}>
      <div className="sp-karte-kopf"><Users strokeWidth={2.2} /><strong>Personal Brand</strong><span className="sp-xp-tag">+{XP.je1000Follower.toLocaleString('de-DE')} je 1.000</span></div>
      <div className="sp-follower-zeile">
        <strong>{Math.round(gesamt).toLocaleString('de-DE')}</strong>
        <span>Follower · nächste Marke <b>{f.naechste.toLocaleString('de-DE')}</b></span>
      </div>
      <div className="st-umsatz-balken"><i style={{ width: `${Math.round(f.fortschritt * 100)}%` }} /></div>
      <div className="st-umsatz-unten"><span>TikTok <b>{f.tiktok.toLocaleString('de-DE')}</b> · Instagram <b>{f.instagram.toLocaleString('de-DE')}</b></span><span>{f.marken > 0 ? <><b>{f.marken}</b> {f.marken === 1 ? 'Marke' : 'Marken'} geknackt</> : 'noch keine Marke'}</span></div>
    </section>
  )
}

// ----------------------------------------------------------------- Ziele
function Ziele({ ziele, f, bauplan, onNeu, sag }: { ziele: ZielStand[]; f: FollowerStand; bauplan: React.ReactNode; onNeu: () => void; sag: (t: string) => void }) {
  const [neu, setNeu] = useState(false)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const offen = ziele.filter((z) => !z.eingeloest)
  const fertig = ziele.filter((z) => z.eingeloest)

  async function einloesen(z: ZielStand) {
    setLaeuft(z.ziel.id)
    try { await zielEinloesen(z.ziel.id); celebrate(); sag(z.ziel.belohnung ? `Verdient: ${z.ziel.belohnung}` : `Geschafft: ${z.ziel.titel}`); onNeu() }
    catch (e) { sag('Ging nicht: ' + (e as Error).message) } finally { setLaeuft(null) }
  }

  return (
    <main className="sp-inhalt">
      <FollowerKarte f={f} />
      {bauplan}
      <div className="sp-abschnitt"><h2>Ziele</h2><button className="sp-klein" onClick={() => setNeu(true)}><Plus strokeWidth={2.6} /> Ziel</button></div>
      <ul className="sp-ziele">
        {offen.map((z) => (
          <li key={z.ziel.id} className={z.erreicht ? 'da' : ''}>
            <div className="sp-ziel-kopf">
              <strong>{z.ziel.titel}</strong>
              {z.erreicht
                ? <button className="sp-klein" disabled={laeuft === z.ziel.id} onClick={() => einloesen(z)}><Gift strokeWidth={2.4} /> Einlösen</button>
                : <span className="sp-schloss"><Lock strokeWidth={2.2} /></span>}
            </div>
            {z.ziel.belohnung && <p className="sp-ziel-belohnung"><Gift strokeWidth={2.2} /> {z.ziel.belohnung}</p>}
            <div className="st-umsatz-balken"><i style={{ width: `${Math.round(z.fortschritt * 100)}%` }} /></div>
            <div className="sp-ziel-fuss">
              <small>{z.ziel.typ === 'datum' && z.ziel.datum ? `${new Date(z.ziel.datum + 'T12:00:00').toLocaleDateString('de-DE')} · ${z.text}` : z.text}</small>
              {!z.ziel.schluessel && <button className="sp-leise" onClick={async () => { if (!window.confirm(`Ziel „${z.ziel.titel}“ entfernen?`)) return; await zielLoeschen(z.ziel.id); onNeu() }} aria-label="Entfernen"><Trash2 strokeWidth={2.2} /></button>}
            </div>
          </li>
        ))}
        {offen.length === 0 && <li className="leer">Noch keine Ziele. Legt fest, was ihr euch bei welcher Marke gönnt.</li>}
      </ul>
      {fertig.length > 0 && (
        <>
          <div className="sp-abschnitt"><h2>Eingelöst</h2><span>{fertig.length}</span></div>
          <ul className="sp-quests fertig">
            {fertig.map((z) => (
              <li key={z.ziel.id}>
                <div className="sp-quest-text"><strong>{z.ziel.titel}</strong><small>{z.ziel.belohnung ? `${z.ziel.belohnung} · ` : ''}{z.ziel.eingeloest_am ? new Date(z.ziel.eingeloest_am).toLocaleDateString('de-DE') : ''}</small></div>
                <div className="sp-quest-rechts"><button className="sp-leise" onClick={async () => { await zielEinloesen(z.ziel.id, true); onNeu() }} aria-label="Zurücknehmen"><RotateCcw strokeWidth={2.2} /></button></div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="sp-fuss">Ein Ziel öffnet sich erst, wenn die echte Zahl stimmt. Einlösen heißt: Ihr habt es euch wirklich gegönnt.</p>
      {neu && <NeuesZiel onZu={() => setNeu(false)} onFertig={() => { setNeu(false); onNeu() }} sag={sag} />}
    </main>
  )
}

function NeuesZiel({ onZu, onFertig, sag }: { onZu: () => void; onFertig: () => void; sag: (t: string) => void }) {
  const [titel, setTitel] = useState('')
  const [belohnung, setBelohnung] = useState('')
  const [typ, setTyp] = useState<ZielTyp>('follower')
  const [wert, setWert] = useState('')
  const [datum, setDatum] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const t = ZIEL_TYPEN.find((x) => x.key === typ)!
  const zahl = Number(wert.replace(/\./g, '').replace(',', '.'))
  const gueltig = !!titel.trim() && (typ === 'datum' ? !!datum : zahl > 0)
  return (
    <div className="sp-sheet-hinter" onClick={onZu}>
      <div className="sp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sp-sheet-kopf"><strong>Neues Ziel</strong><button onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button></div>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Ziel, z. B. 5.000 Follower" autoFocus />
        <input value={belohnung} onChange={(e) => setBelohnung(e.target.value)} placeholder="Echte Belohnung, z. B. neue Kamera (optional)" />
        <div className="sp-chips">
          {ZIEL_TYPEN.map((x) => <button key={x.key} className={typ === x.key ? 'an' : ''} onClick={() => setTyp(x.key)}>{x.name}</button>)}
        </div>
        {typ === 'datum'
          ? <label>Ab wann <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
          : <label>Ab wie viel ({t.einheit}) <input inputMode="numeric" value={wert} onChange={(e) => setWert(e.target.value)} placeholder={typ === 'level' ? '3' : '5000'} /></label>}
        <button className="sp-knopf" disabled={!gueltig || laeuft} onClick={async () => {
          setLaeuft(true)
          try { await zielAnlegen({ titel, belohnung, typ, wert: typ === 'datum' ? null : zahl, datum }); sag('Ziel angelegt'); onFertig() }
          catch (e) { sag('Ging nicht: ' + (e as Error).message) } finally { setLaeuft(false) }
        }}>Anlegen</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- Eintragen
// Der Plus-Knopf: was hier eingetragen wird, steht danach echt im CRM.
function Eintragen({ art, setArt, d, onZu, onPosten, onFertig, sag }: {
  art: Plus; setArt: (a: Plus) => void; d: SpielDaten; onZu: () => void
  onPosten: (clientId: string, name: string, eigen: boolean) => Promise<boolean>; onFertig: () => void; sag: (t: string) => void
}) {
  const [laeuft, setLaeuft] = useState(false)
  // Kunde / Lead
  const [gewonnen, setGewonnen] = useState(false)
  const [name, setName] = useState('')
  const [honorar, setHonorar] = useState('')
  const [videos, setVideos] = useState('')
  // Termin
  const [titel, setTitel] = useState('')
  const [tag, setTag] = useState(d.heute)
  const [von, setVon] = useState('')
  const [drehtag, setDrehtag] = useState(false)
  const [kunde, setKunde] = useState('')
  const zahl = (v: string) => { const x = Number(v.replace(/\./g, '').replace(',', '.')); return v.trim() && Number.isFinite(x) ? x : null }
  const kopf = art === 'menue' ? 'Eintragen' : art === 'video' ? 'Video gepostet' : art === 'kunde' ? 'Kunde oder Lead' : 'Termin'

  async function tu(f: () => Promise<void>, ok: string) {
    setLaeuft(true)
    try { await f(); sag(ok); onFertig() } catch (e) { sag('Ging nicht: ' + (e as Error).message) } finally { setLaeuft(false) }
  }

  return (
    <div className="sp-sheet-hinter" onClick={onZu}>
      <div className="sp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sp-sheet-kopf"><strong>{kopf}</strong><button onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button></div>

        {art === 'menue' && (
          <div className="sp-menue">
            <button onClick={() => setArt('video')}><Video strokeWidth={2.2} /><span><strong>Video gepostet</strong><small>Zählt sofort im CRM und holt Link und Zahlen</small></span></button>
            <button onClick={() => setArt('quest')}><ListChecks strokeWidth={2.2} /><span><strong>Quest</strong><small>Aufgabe oder Meilenstein der Agentur</small></span></button>
            <button onClick={() => setArt('kunde')}><UserPlus strokeWidth={2.2} /><span><strong>Kunde oder Lead</strong><small>Neuer Kontakt oder gewonnener Kunde</small></span></button>
            <button onClick={() => setArt('termin')}><CalendarPlus strokeWidth={2.2} /><span><strong>Termin oder Drehtag</strong><small>Landet im gemeinsamen Kalender</small></span></button>
          </div>
        )}

        {art === 'video' && (
          <>
            <p className="sp-sheet-hinweis">Für wen ist es rausgegangen?</p>
            <div className="sp-wahl">
              {d.postbar.map((k) => (
                <button key={k.id} disabled={laeuft} onClick={async () => { setLaeuft(true); try { if (await onPosten(k.id, k.name, k.eigen)) onZu() } finally { setLaeuft(false) } }}>
                  {k.name}<span className="sp-xp-tag">+{k.eigen ? XP.eigenesVideo : XP.video}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {art === 'kunde' && (
          <>
            <div className="sp-chips">
              <button className={!gewonnen ? 'an' : ''} onClick={() => setGewonnen(false)}>Lead</button>
              <button className={gewonnen ? 'an' : ''} onClick={() => setGewonnen(true)}>Kunde gewonnen</button>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name des Unternehmens" autoFocus />
            <input inputMode="decimal" value={honorar} onChange={(e) => setHonorar(e.target.value)} placeholder={gewonnen ? 'Honorar netto im Monat (€)' : 'Mögliches Honorar im Monat (€, optional)'} />
            {gewonnen && <input inputMode="numeric" value={videos} onChange={(e) => setVideos(e.target.value)} placeholder="Videos im Monat" />}
            <button className="sp-knopf" disabled={!name.trim() || laeuft || (gewonnen && (zahl(honorar) == null || zahl(videos) == null))} onClick={() => gewonnen
              ? tu(() => kundeAnlegen({ name, honorar: zahl(honorar), videos: zahl(videos), heute: d.heute }), `${name.trim()} ist Kunde`)
              : tu(() => leadAnlegen({ name, honorar: zahl(honorar) }), `Lead ${name.trim()} angelegt`)}>{gewonnen ? 'Kunde anlegen' : 'Lead anlegen'}</button>
            {gewonnen && <p className="sp-sheet-hinweis">Die +{XP.neuerKunde.toLocaleString('de-DE')} XP gibt es mit dem ersten geposteten Video.</p>}
          </>
        )}

        {art === 'termin' && (
          <>
            <div className="sp-chips">
              <button className={!drehtag ? 'an' : ''} onClick={() => setDrehtag(false)}>Termin</button>
              <button className={drehtag ? 'an' : ''} onClick={() => setDrehtag(true)}>Drehtag</button>
            </div>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={drehtag ? 'Titel (leer = „Drehtag“)' : 'Was?'} autoFocus />
            <label>Tag <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} /></label>
            <label>Uhrzeit (optional) <input type="time" value={von} onChange={(e) => setVon(e.target.value)} /></label>
            <label>Kunde (optional)
              <select value={kunde} onChange={(e) => setKunde(e.target.value)}>
                <option value="">—</option>
                {d.postbar.filter((k) => !k.eigen).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </label>
            <button className="sp-knopf" disabled={laeuft || !tag || (!drehtag && !titel.trim())} onClick={() => tu(
              () => terminAnlegen({ titel: titel.trim() || 'Drehtag', tag, von: von || null, clientId: kunde || null, drehtag }),
              drehtag ? 'Drehtag steht im Kalender' : 'Termin steht im Kalender')}>Eintragen</button>
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- Aufträge
function Auftraege({ liste }: { liste: Empfehlung[] }) {
  const top = liste.filter((e) => e.art !== 'ideen').slice(0, 6)
  if (!top.length) return (
    <section className="sp-karte"><div className="sp-karte-kopf"><Sparkles strokeWidth={2.2} /><strong>Heute</strong></div><p>Alles im Plan. Das Studio läuft von allein.</p></section>
  )
  return (
    <section className="sp-karte">
      <div className="sp-karte-kopf"><Sparkles strokeWidth={2.2} /><strong>Was heute Punkte bringt</strong></div>
      <ul className="sp-liste">
        {top.map((e) => (
          <li key={e.key}>
            <a href={e.ziel.startsWith('/') ? e.ziel : '/'} target="_blank" rel="noopener">
              <span className="sp-liste-text"><strong>{e.titel}</strong><small>{e.kunde ?? 'Agentur'}</small></span>
              <span className="sp-xp-tag">+{auftragXp(e)}</span>
              <ExternalLink strokeWidth={2.2} />
            </a>
          </li>
        ))}
      </ul>
      <p className="sp-fuss">Erledigt wird im CRM — die Punkte zählen, sobald es dort echt eingetragen ist.</p>
    </section>
  )
}

// ---------------------------------------------------------------- Quests
function Quests({ quests, levelNr, auftraege, onNeu, sag }: { quests: (SQuest & { gesperrt: boolean })[]; levelNr: number; auftraege: Empfehlung[]; onNeu: () => void; sag: (t: string) => void }) {
  const [neu, setNeu] = useState(false)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const offen = quests.filter((q) => q.status === 'offen')
  const fertig = quests.filter((q) => q.status === 'erledigt')

  async function erledigen(q: SQuest) {
    setLaeuft(q.id)
    try {
      await questErledigen(q.id, null)
      celebrate()
      sag(`+${q.xp} XP · ${q.titel}`)
      onNeu()
    } catch (e) { sag('Ging nicht: ' + (e as Error).message) } finally { setLaeuft(null) }
  }

  return (
    <main className="sp-inhalt">
      <Auftraege liste={auftraege} />
      <div className="sp-abschnitt"><h2>Offen</h2><button className="sp-klein" onClick={() => setNeu(true)}><Plus strokeWidth={2.6} /> Quest</button></div>
      <ul className="sp-quests">
        {offen.map((q) => (
          <li key={q.id} className={`${q.art} ${q.gesperrt ? 'gesperrt' : ''}`}>
            <div className="sp-quest-text">
              <strong>{q.titel}</strong>
              {q.beschreibung && <p>{q.beschreibung}</p>}
              <small>
                {q.art === 'meilenstein' ? 'Meilenstein' : 'Aufgabe'}
                {q.faellig ? ` · bis ${new Date(q.faellig + 'T12:00:00').toLocaleDateString('de-DE')}` : ''}
                {q.gesperrt ? ` · ab ${LEVEL[q.ab_level]?.name ?? 'Level ' + q.ab_level}` : ''}
              </small>
            </div>
            <div className="sp-quest-rechts">
              <span className="sp-xp-tag gross">+{q.xp.toLocaleString('de-DE')}</span>
              {q.gesperrt ? <span className="sp-schloss"><Lock strokeWidth={2.2} /></span>
                : <button className="sp-haken" disabled={laeuft === q.id} onClick={() => erledigen(q)} aria-label="Erledigt"><Check strokeWidth={3} /></button>}
            </div>
          </li>
        ))}
        {offen.length === 0 && <li className="leer">Keine offenen Quests. Leg eine an — oder genieß den Moment.</li>}
      </ul>

      {fertig.length > 0 && (
        <>
          <div className="sp-abschnitt"><h2>Geschafft</h2><span>{fertig.length}</span></div>
          <ul className="sp-quests fertig">
            {fertig.map((q) => (
              <li key={q.id}>
                <div className="sp-quest-text"><strong>{q.titel}</strong><small>{q.erledigt_am ? new Date(q.erledigt_am).toLocaleDateString('de-DE') : ''}</small></div>
                <div className="sp-quest-rechts">
                  <span className="sp-xp-tag">+{q.xp.toLocaleString('de-DE')}</span>
                  <button className="sp-leise" onClick={async () => { await questZurueck(q.id); onNeu() }} aria-label="Wieder öffnen"><RotateCcw strokeWidth={2.2} /></button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="sp-fuss">Level {levelNr}: Gesperrte Quests öffnen sich, sobald die Agentur das Level erreicht.</p>
      {neu && <NeueQuest onZu={() => setNeu(false)} onFertig={() => { setNeu(false); onNeu() }} sag={sag} />}
    </main>
  )
}

function NeueQuest({ onZu, onFertig, sag }: { onZu: () => void; onFertig: () => void; sag: (t: string) => void }) {
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [xp, setXp] = useState(500)
  const [art, setArt] = useState<'meilenstein' | 'aufgabe'>('aufgabe')
  const [faellig, setFaellig] = useState('')
  const [abLevel, setAbLevel] = useState(0)
  const [laeuft, setLaeuft] = useState(false)
  return (
    <div className="sp-sheet-hinter" onClick={onZu}>
      <div className="sp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sp-sheet-kopf"><strong>Neue Quest</strong><button onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button></div>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Was? z. B. Website-Relaunch" autoFocus />
        <input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Wann zählt es als erledigt? (optional)" />
        <div className="sp-chips">
          <button className={art === 'aufgabe' ? 'an' : ''} onClick={() => setArt('aufgabe')}>Aufgabe</button>
          <button className={art === 'meilenstein' ? 'an' : ''} onClick={() => setArt('meilenstein')}>Meilenstein</button>
        </div>
        <div className="sp-chips">
          {[250, 500, 1000, 2000, 5000].map((w) => <button key={w} className={xp === w ? 'an' : ''} onClick={() => setXp(w)}>+{w.toLocaleString('de-DE')}</button>)}
        </div>
        <label>Fällig <input type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} /></label>
        <label>Freigeschaltet ab
          <select value={abLevel} onChange={(e) => setAbLevel(Number(e.target.value))}>
            {LEVEL.map((l) => <option key={l.nr} value={l.nr}>{l.nr} · {l.name}</option>)}
          </select>
        </label>
        <button className="sp-knopf" disabled={!titel.trim() || laeuft} onClick={async () => {
          setLaeuft(true)
          try { await questAnlegen({ titel, beschreibung, xp, art, faellig: faellig || null, ab_level: abLevel }); sag('Quest angelegt'); onFertig() }
          catch (e) { sag('Ging nicht: ' + (e as Error).message) } finally { setLaeuft(false) }
        }}>Anlegen</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Bilanz
function Bilanz({ d }: { d: SpielDaten }) {
  const s = d.stand
  const [offenMonat, setOffenMonat] = useState<string | null>(null)
  const monate = useMemo(() => s.monate.slice(0, 12), [s.monate])
  const u = s.umsatz
  return (
    <main className="sp-inhalt">
      <section className="sp-karte sp-umsatzkarte">
        <div className="sp-karte-kopf"><Euro strokeWidth={2.2} /><strong>Umsatz · {monatName(u.monat)}</strong></div>
        <div className="sp-umsatz-gross">{euro(u.gestellt)}</div>
        <div className="sp-umsatz-klein">
          <span><b>{euro(u.bezahlt)}</b> bezahlt</span>
          <span><b>{euro(u.offen)}</b> offen</span>
          <span>Vormonat <b>{euro(u.vormonat.gestellt)}</b></span>
          <span>Bisher bezahlt <b>{euro(u.gesamtBezahlt)}</b></span>
        </div>
        <ul className="sp-posten">
          {u.proKunde.map((k) => (
            <li key={k.id}><span>{k.name}<small>{k.geschaetzt ? 'ohne Monatsplan · Honorar angenommen' : k.zahlstatus === 'bezahlt' ? 'bezahlt' : k.zahlstatus === 'rechnung' ? 'Rechnung raus' : 'offen'}</small></span><strong className={k.zahlstatus === 'bezahlt' ? 'gruen' : ''}>{euro(k.betrag)}</strong></li>
          ))}
          {u.proKunde.length === 0 && <li className="leer">Noch kein Umsatz in diesem Monat eingetragen.</li>}
        </ul>
        <div className="sp-meilensteine">
          {MEILENSTEINE.map((m) => (
            <span key={m} className={u.erreicht.includes(m) ? 'da' : m === u.naechster ? 'naechster' : ''}>{m >= 1000 ? `${m / 1000}k` : m}</span>
          ))}
        </div>
        <p className="sp-fuss">Ziele sind Monatsumsatz (gestellt). Grün = schon mal erreicht, Orange = das nächste.</p>
      </section>

      <section className="sp-karte">
        <div className="sp-karte-kopf"><Trophy strokeWidth={2.2} /><strong>{s.xp.toLocaleString('de-DE')} XP · woher</strong></div>
        <ul className="sp-posten">
          {s.posten.filter((p) => p.xp > 0 || p.key === 'streak').map((p) => (
            <li key={p.key}><span>{p.label}<small>{p.key === 'views' ? kurzZahl(p.anzahl) : p.anzahl.toLocaleString('de-DE')}</small></span><strong>+{p.xp.toLocaleString('de-DE')}</strong></li>
          ))}
        </ul>
      </section>

      <div className="sp-abschnitt"><h2>Rekorde</h2></div>
      <div className="sp-rekorde">
        {s.rekorde.map((r) => (
          <div key={r.label} className="sp-rekord"><small>{r.label}</small><strong>{r.wert}</strong>{r.wann && <span>{/^\d{4}-\d{2}$/.test(r.wann) ? monatName(r.wann) : new Date(r.wann + 'T12:00:00').toLocaleDateString('de-DE')}</span>}</div>
        ))}
      </div>

      {s.hits.length > 0 && (
        <>
          <div className="sp-abschnitt"><h2>Hits</h2><span>{s.hits.length}</span></div>
          <ul className="sp-hits">
            {s.hits.slice(0, 6).map((h) => (
              <li key={h.video.id}><Sparkles strokeWidth={2.2} /><span>{h.video.title ?? 'Video'}</span><strong>{h.faktor.toFixed(1).replace('.', ',')}×</strong></li>
            ))}
          </ul>
        </>
      )}

      <div className="sp-abschnitt"><h2>Monate</h2></div>
      <div className="sp-monate">
        {monate.map((m) => (
          <button key={m.key} className={`sp-monat ${offenMonat === m.key ? 'offen' : ''}`} onClick={() => setOffenMonat(offenMonat === m.key ? null : m.key)}>
            <div className="sp-monat-kopf"><strong>{monatName(m.key)}</strong><span className="sp-xp-tag">+{m.xp.toLocaleString('de-DE')}</span></div>
            <div className="sp-monat-zahlen">
              <span><b>{m.videos}</b> Videos{m.rekordVideos ? ' 🏆' : ''}</span>
              <span><b>{kurzZahl(m.views)}</b> Views{m.rekordViews ? ' 🏆' : ''}</span>
              {m.umsatz > 0 && <span><b>{euro(m.umsatz)}</b> bezahlt</span>}
              {m.gruen > 0 && <span><b>{m.gruen}</b> ✓ Monate</span>}
            </div>
          </button>
        ))}
      </div>
    </main>
  )
}
