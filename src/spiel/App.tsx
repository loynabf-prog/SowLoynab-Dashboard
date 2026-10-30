// Das Spiel -- eigene Web-App unter /spiel/. Gleiche Anmeldung wie das CRM,
// gleiche Daten. Drei Reiter: Stadt, Quests, Bilanz.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flame, Trophy, Building2, ListChecks, BarChart3, Lock, Check, Plus, X, RefreshCw, Sparkles, ExternalLink, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { celebrate } from '../lib/confetti'
import { LEVEL, kurzZahl, monatName, type SQuest } from '../lib/spiel'
import type { Empfehlung } from '../lib/pilot'
import { auftragXp, ladeSpiel, questAnlegen, questErledigen, questZurueck, type SpielDaten } from './daten'
import Stadt from './Stadt'
import './spiel.css'

type Reiter = 'stadt' | 'quests' | 'bilanz'

export default function SpielApp() {
  const [angemeldet, setAngemeldet] = useState<boolean | null>(null)
  const [daten, setDaten] = useState<SpielDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [reiter, setReiter] = useState<Reiter>('stadt')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [nacht, setNacht] = useState(() => { const h = new Date().getHours(); return h >= 18 || h < 7 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAngemeldet(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAngemeldet(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const laden = useCallback(async () => {
    try { setDaten(await ladeSpiel()); setFehler(null) } catch (e) { setFehler((e as Error).message) }
  }, [])
  useEffect(() => { if (angemeldet) laden() }, [angemeldet, laden])

  function sag(t: string) { setMeldung(t); window.setTimeout(() => setMeldung(null), 2600) }

  if (angemeldet === false) {
    return (
      <div className="sp-login">
        <div className="sp-logo">S&amp;L</div>
        <h1>Die Stadt</h1>
        <p>Melde dich einmal im CRM an — dann bist du auch hier drin.</p>
        <a className="sp-knopf" href="/">Zum CRM</a>
      </div>
    )
  }

  const s = daten?.stand
  return (
    <div className={`sp ${nacht ? 'nacht' : ''}`}>
      <header className="sp-kopf">
        <div className="sp-level">
          <span className="sp-level-nr">{s ? s.level.nr : '·'}</span>
          <div>
            <strong>{s ? s.level.name : 'Lade …'}</strong>
            <small>{s ? `${s.xp.toLocaleString('de-DE')} XP${s.naechstes ? ` · ${(s.naechstes.ab - s.xp).toLocaleString('de-DE')} bis ${s.naechstes.name}` : ' · Endstufe'}` : ''}</small>
          </div>
        </div>
        <div className="sp-kopf-rechts">
          <span className={`sp-streak ${s?.heuteGepostet ? 'an' : ''}`} title="Posting-Streak"><Flame strokeWidth={2.4} /> {s?.streak ?? 0}</span>
          <button className="sp-rund" onClick={() => setNacht((n) => !n)} aria-label="Tag/Nacht">{nacht ? '☾' : '☀'}</button>
          <button className="sp-rund" onClick={laden} aria-label="Aktualisieren"><RefreshCw strokeWidth={2.2} /></button>
        </div>
      </header>
      <div className="sp-xp"><i style={{ width: `${(s?.fortschritt ?? 0) * 100}%` }} /></div>

      {fehler && <p className="sp-fehler">{fehler}</p>}
      {!daten && !fehler && <div className="sp-lade">Baue die Stadt …</div>}

      {daten && reiter === 'stadt' && (
        <main className="sp-inhalt">
          <Stadt gebaeude={daten.gebaeude} level={daten.stand.level} nacht={nacht} />
          <section className="sp-karte sp-hqkarte">
            <div className="sp-karte-kopf"><Building2 strokeWidth={2.2} /><strong>Sow &amp; Loynab · {daten.stand.level.name}</strong></div>
            <p>{daten.stand.level.satz}</p>
            {daten.stand.naechstes && (
              <p className="sp-naechstes">Nächstes Level <strong>{daten.stand.naechstes.name}</strong> bei {daten.stand.naechstes.ab.toLocaleString('de-DE')} XP
                {daten.stand.naechstes.schaltetFrei ? <> — schaltet frei: <strong>{daten.stand.naechstes.schaltetFrei}</strong></> : null}</p>
            )}
          </section>
          <Auftraege liste={daten.auftraege} />
        </main>
      )}

      {daten && reiter === 'quests' && (
        <Quests quests={daten.stand.quests} levelNr={daten.stand.level.nr} onNeu={laden} sag={sag} />
      )}

      {daten && reiter === 'bilanz' && <Bilanz d={daten} />}

      <nav className="sp-tabs">
        <button className={reiter === 'stadt' ? 'an' : ''} onClick={() => setReiter('stadt')}><Building2 strokeWidth={2.2} /><span>Stadt</span></button>
        <button className={reiter === 'quests' ? 'an' : ''} onClick={() => setReiter('quests')}><ListChecks strokeWidth={2.2} /><span>Quests</span>{s && s.quests.some((q) => q.status === 'offen' && !q.gesperrt) && <i />}</button>
        <button className={reiter === 'bilanz' ? 'an' : ''} onClick={() => setReiter('bilanz')}><BarChart3 strokeWidth={2.2} /><span>Bilanz</span></button>
      </nav>
      {meldung && <div className="sp-toast">{meldung}</div>}
    </div>
  )
}

// ------------------------------------------------------------- Aufträge
function Auftraege({ liste }: { liste: Empfehlung[] }) {
  const top = liste.filter((e) => e.art !== 'ideen').slice(0, 6)
  if (!top.length) return (
    <section className="sp-karte"><div className="sp-karte-kopf"><Sparkles strokeWidth={2.2} /><strong>Heute</strong></div><p>Alles im Plan. Die Stadt wächst von selbst weiter.</p></section>
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
function Quests({ quests, levelNr, onNeu, sag }: { quests: (SQuest & { gesperrt: boolean })[]; levelNr: number; onNeu: () => void; sag: (t: string) => void }) {
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
  return (
    <main className="sp-inhalt">
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
              {m.umsatz > 0 && <span><b>{Math.round(m.umsatz).toLocaleString('de-DE')} €</b> bezahlt</span>}
              {m.gruen > 0 && <span><b>{m.gruen}</b> ✓ Monate</span>}
            </div>
          </button>
        ))}
      </div>
    </main>
  )
}
