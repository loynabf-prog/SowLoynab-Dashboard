// Medien: unsere Dropbox, aber schoen.
// ---------------------------------------------------------------------------
// Pro Kunde der Dropbox-Ordner als Galerie: Drehtage, Rohmaterial, Schnitt,
// Final. Vorschaubilder, Abspielen im Browser, Suche und Verschieben.
// Alles passiert in Dropbox selbst -- verschoben ist verschoben, auch auf
// dem PC. Die Zuordnung Kunde -> Ordner steht in clients.dropbox_ordner.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import {
  BASIS, brotkrumen, dropbox, dropboxWebLink, groesse, relativ, sortiert,
  type DropboxStatus, type Eintrag,
} from '../lib/medien'

interface KundeOrdner { id: string; name: string; ordner: string[] }

const ICON: Record<Eintrag['art'], string> = { ordner: '📁', video: '🎬', bild: '🖼', datei: '📄' }

export default function Medien() {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<DropboxStatus | null>(null)
  const [statusFehler, setStatusFehler] = useState<string | null>(null)
  const [kunden, setKunden] = useState<KundeOrdner[]>([])
  const [start, setStart] = useState<string | null>(null)
  const [pfad, setPfad] = useState<string | null>(null)
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [vorschau, setVorschau] = useState<Record<string, string | null>>({})
  const [suche, setSuche] = useState('')
  const [treffer, setTreffer] = useState<Eintrag[] | null>(null)
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set())
  const [abspielen, setAbspielen] = useState<{ eintrag: Eintrag; url: string | null } | null>(null)
  const [verschieben, setVerschieben] = useState(false)

  // ---- Verbindung & Kunden -------------------------------------------------
  const ladeStatus = useCallback(async () => {
    try { setStatus(await dropbox.status()); setStatusFehler(null) } catch (e) { setStatusFehler((e as Error).message) }
  }, [])

  useEffect(() => {
    ladeStatus()
    supabase.from('clients').select('id, name, dropbox_ordner').is('deleted_at', null).order('name')
      .then(({ data }) => {
        const liste = ((data ?? []) as { id: string; name: string; dropbox_ordner: string[] | null }[])
          .filter((k) => k.dropbox_ordner && k.dropbox_ordner.length)
          .map((k) => ({ id: k.id, name: k.name, ordner: k.dropbox_ordner! }))
        setKunden(liste)
      })
  }, [ladeStatus])

  // Startordner aus der Adresse (?kunde=<id>) oder der erste Kunde.
  useEffect(() => {
    if (!kunden.length || start) return
    const k = kunden.find((x) => x.id === params.get('kunde')) ?? kunden[0]
    setStart(k.ordner[0]); setPfad(k.ordner[0])
  }, [kunden, params, start])

  const aktiverKunde = useMemo(
    () => kunden.find((k) => k.ordner.some((o) => start?.toLowerCase() === o.toLowerCase())) ?? null,
    [kunden, start],
  )

  function waehleOrdner(k: KundeOrdner | null, o: string) {
    setStart(o); setPfad(o); setSuche(''); setTreffer(null); setAuswahl(new Set())
    if (k) setParams({ kunde: k.id }, { replace: true })
    else setParams({}, { replace: true })
  }

  // ---- Ordner laden --------------------------------------------------------
  const vorschauGeholt = useRef(new Set<string>())

  const ladeVorschauen = useCallback(async (liste: Eintrag[]) => {
    const offen = liste.filter((e) => (e.art === 'bild' || e.art === 'video') && !vorschauGeholt.current.has(e.pfad))
    for (let i = 0; i < offen.length; i += 25) {
      const stueck = offen.slice(i, i + 25)
      stueck.forEach((e) => vorschauGeholt.current.add(e.pfad))
      try {
        const r = await dropbox.vorschauen(stueck.map((e) => e.pfad))
        setVorschau((prev) => ({ ...prev, ...Object.fromEntries(r.map((x) => [x.pfad, x.bild])) }))
      } catch { /* Vorschau ist Komfort -- ohne geht es auch */ }
    }
  }, [])

  const ladeOrdner = useCallback(async (p: string) => {
    setLaedt(true); setFehler(null); setAuswahl(new Set())
    try {
      const liste = sortiert(await dropbox.liste(p))
      setEintraege(liste)
      ladeVorschauen(liste)
    } catch (e) {
      setFehler((e as Error).message); setEintraege([])
    }
    setLaedt(false)
  }, [ladeVorschauen])

  useEffect(() => { if (pfad && status?.verbunden) ladeOrdner(pfad) }, [pfad, status?.verbunden, ladeOrdner])

  // ---- Suche ---------------------------------------------------------------
  useEffect(() => {
    const q = suche.trim()
    if (q.length < 2 || !start) { setTreffer(null); return }
    const t = setTimeout(async () => {
      try {
        const r = sortiert(await dropbox.suche(q, start))
        setTreffer(r); ladeVorschauen(r)
      } catch (e) { toast('Suche fehlgeschlagen: ' + (e as Error).message) }
    }, 400)
    return () => clearTimeout(t)
  }, [suche, start, toast, ladeVorschauen])

  // ---- Aktionen ------------------------------------------------------------
  async function oeffnen(e: Eintrag) {
    if (e.ordner) { setSuche(''); setTreffer(null); setPfad(e.pfad); return }
    if (e.art === 'video' || e.art === 'bild') {
      setAbspielen({ eintrag: e, url: null })
      try { setAbspielen({ eintrag: e, url: await dropbox.link(e.pfad) }) } catch (err) {
        setAbspielen(null); toast('Konnte nicht öffnen: ' + (err as Error).message)
      }
      return
    }
    try { window.open(await dropbox.link(e.pfad), '_blank', 'noopener') } catch (err) {
      toast('Konnte nicht öffnen: ' + (err as Error).message)
    }
  }

  function umschalten(p: string) {
    setAuswahl((prev) => {
      const n = new Set(prev)
      if (n.has(p)) n.delete(p); else n.add(p)
      return n
    })
  }

  async function verschiebeNach(ziel: string) {
    const pfade = [...auswahl]
    setVerschieben(false)
    try {
      const r = await dropbox.verschieben(pfade, ziel)
      const ok = r.filter((x) => x.ok).length
      const schief = r.filter((x) => !x.ok)
      toast(schief.length ? `${ok} verschoben, ${schief.length} fehlgeschlagen: ${schief[0].fehler}` : `${ok} verschoben ✓`)
    } catch (e) { toast('Verschieben fehlgeschlagen: ' + (e as Error).message) }
    if (pfad) ladeOrdner(pfad)
  }

  // ---- Darstellung ---------------------------------------------------------
  if (statusFehler || (status && !status.verbunden)) {
    return <Einrichtung status={status} fehler={statusFehler} onVerbunden={ladeStatus} />
  }

  const anzeige = treffer ?? eintraege
  const krumen = start && pfad ? brotkrumen(start, pfad) : []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Medien</h1>
          <span className="sub">{status ? `Dropbox${status.konto ? ` · ${status.konto}` : ''}` : 'Lade …'}</span>
        </div>
        <div className="spacer" />
        {pfad && <a className="btn btn-sm" href={dropboxWebLink(pfad)} target="_blank" rel="noopener noreferrer">In Dropbox öffnen ↗</a>}
      </div>

      <div className="medien-kunden">
        {kunden.flatMap((k) => k.ordner.map((o) => (
          <button
            key={o}
            className={`ps-schritt ${start?.toLowerCase() === o.toLowerCase() ? 'on' : ''}`}
            onClick={() => waehleOrdner(k, o)}
          >
            {k.ordner.length > 1 ? o.split('/').pop() : k.name}
          </button>
        )))}
        <button className={`ps-schritt ${start === BASIS ? 'on' : ''}`} onClick={() => waehleOrdner(null, BASIS)}>
          Alles
        </button>
      </div>

      <div className="medien-leiste">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder={`Suchen in ${aktiverKunde?.name ?? 'allen Medien'} …`}
          aria-label="Medien durchsuchen"
        />
      </div>

      {!treffer && krumen.length > 1 && (
        <div className="medien-krumen">
          {krumen.map((k, i) => (
            <span key={k.pfad}>
              {i > 0 && <span className="medien-trenner">›</span>}
              <button className="medien-krume" onClick={() => setPfad(k.pfad)} disabled={i === krumen.length - 1}>{k.name}</button>
            </span>
          ))}
        </div>
      )}
      {treffer && <div className="medien-krumen muted">{treffer.length} Treffer für „{suche.trim()}“</div>}

      {auswahl.size > 0 && (
        <div className="medien-auswahl">
          <span><strong>{auswahl.size}</strong> ausgewählt</span>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={() => setAuswahl(new Set())}>Abbrechen</button>
          <button className="btn btn-sm btn-primary" onClick={() => setVerschieben(true)}>Verschieben nach …</button>
        </div>
      )}

      {fehler && <div className="col-empty" style={{ padding: 20 }}>⚠️ {fehler}</div>}
      {!fehler && laedt && !treffer && <div className="col-empty" style={{ padding: 20 }}>Lade …</div>}
      {!fehler && !laedt && anzeige.length === 0 && (
        <div className="col-empty" style={{ padding: 20 }}>{treffer ? 'Nichts gefunden.' : 'Dieser Ordner ist leer.'}</div>
      )}

      <div className="medien-raster">
        {anzeige.map((e) => {
          const bild = vorschau[e.pfad]
          const gewaehlt = auswahl.has(e.pfad)
          return (
            <div key={e.pfad} className={`medien-kachel ${e.ordner ? 'ordner' : ''} ${gewaehlt ? 'gewaehlt' : ''}`}>
              <button className="medien-bild" onClick={() => (auswahl.size && !e.ordner ? umschalten(e.pfad) : oeffnen(e))}>
                {bild ? <img src={bild} alt="" loading="lazy" /> : <span className="medien-icon">{ICON[e.art]}</span>}
                {e.art === 'video' && bild && <span className="medien-play">▶</span>}
              </button>
              <div className="medien-name" title={e.name}>{e.name}</div>
              <div className="medien-meta">
                {treffer ? relativ(start ?? BASIS, e.pfad.split('/').slice(0, -1).join('/')) : groesse(e.groesse)}
              </div>
              {!e.ordner && (
                <button
                  className={`medien-haken ${gewaehlt ? 'on' : ''}`}
                  onClick={() => umschalten(e.pfad)}
                  aria-label={gewaehlt ? 'Abwählen' : 'Auswählen'}
                  aria-pressed={gewaehlt}
                >{gewaehlt ? '✓' : ''}</button>
              )}
            </div>
          )
        })}
      </div>

      {abspielen && (
        <Modal title={abspielen.eintrag.name} onClose={() => setAbspielen(null)}>
          {!abspielen.url ? (
            <div className="col-empty" style={{ padding: 30 }}>Lade …</div>
          ) : abspielen.eintrag.art === 'video' ? (
            <video className="medien-player" src={abspielen.url} controls autoPlay playsInline />
          ) : (
            <img className="medien-player" src={abspielen.url} alt={abspielen.eintrag.name} />
          )}
          <div className="modal-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {abspielen.url && <a className="btn btn-sm" href={abspielen.url} target="_blank" rel="noopener noreferrer">Herunterladen</a>}
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => setAbspielen(null)}>Schließen</button>
          </div>
        </Modal>
      )}

      {verschieben && start && (
        <OrdnerWahl start={start} anzahl={auswahl.size} onWahl={verschiebeNach} onClose={() => setVerschieben(false)} />
      )}
    </>
  )
}

/** Zielordner fuer "Verschieben nach ..." -- alle Unterordner des Kunden. */
function OrdnerWahl({ start, anzahl, onWahl, onClose }: { start: string; anzahl: number; onWahl: (p: string) => void; onClose: () => void }) {
  const [ordner, setOrdner] = useState<string[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    dropbox.ordner(start).then((o) => setOrdner([start, ...o])).catch((e) => setFehler((e as Error).message))
  }, [start])
  return (
    <Modal title={`${anzahl} ${anzahl === 1 ? 'Datei' : 'Dateien'} verschieben nach …`} onClose={onClose}>
      {fehler && <div className="col-empty">⚠️ {fehler}</div>}
      {!ordner && !fehler && <div className="col-empty">Lade Ordner …</div>}
      <div className="medien-ordnerliste">
        {(ordner ?? []).map((o) => {
          const rel = relativ(start, o)
          const tiefe = rel === '/' ? 0 : rel.split('/').length
          return (
            <button key={o} className="medien-ordnerwahl" style={{ paddingLeft: 10 + tiefe * 14 }} onClick={() => onWahl(o)}>
              📁 {rel === '/' ? start.split('/').pop() : rel.split('/').pop()}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/** Einmalige Einrichtung: Dropbox-App anlegen, Secrets setzen, verbinden. */
function Einrichtung({ status, fehler, onVerbunden }: { status: DropboxStatus | null; fehler: string | null; onVerbunden: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const appFehlt = status ? !status.appEingerichtet : false

  async function holeCode() {
    try { window.open((await dropbox.authUrl()).url, '_blank', 'noopener') } catch (e) { toast((e as Error).message) }
  }
  async function verbinden() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const r = await dropbox.verbinden(code.trim())
      toast(`Dropbox verbunden${r.konto ? ` (${r.konto})` : ''} ✓`)
      onVerbunden()
    } catch (e) { toast((e as Error).message) }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head"><div><h1>Medien</h1><span className="sub">Dropbox verbinden — einmalig</span></div></div>
      <div className="section-block medien-setup">
        {fehler && <p className="muted">⚠️ {fehler}</p>}
        <ol>
          <li className={appFehlt ? '' : 'erledigt'}>
            <strong>Dropbox-App anlegen</strong> (am PC): dropbox.com/developers/apps → „Create app“ →
            „Scoped access“ → „Full Dropbox“ → Name z. B. „SowLoynab Dashboard“. Unter <em>Permissions</em>
            {' '}<code>files.metadata.read</code>, <code>files.content.read</code>, <code>files.content.write</code> anhaken → Submit.
          </li>
          <li className={appFehlt ? '' : 'erledigt'}>
            <strong>Schlüssel in Supabase eintragen</strong>: Edge Functions → Secrets →
            {' '}<code>DROPBOX_APP_KEY</code> und <code>DROPBOX_APP_SECRET</code> (aus der App-Seite, Reiter „Settings“).
          </li>
          <li>
            <strong>Verbinden</strong>: Code bei Dropbox holen, hier einfügen.
            <div className="medien-verbinden">
              <button className="btn btn-sm" onClick={holeCode} disabled={appFehlt}>1. Code holen ↗</button>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2. Code einfügen" aria-label="Dropbox-Code" />
              <button className="btn btn-sm btn-primary" onClick={verbinden} disabled={busy || !code.trim()}>{busy ? '…' : 'Verbinden'}</button>
            </div>
          </li>
        </ol>
        {appFehlt && <p className="muted" style={{ fontSize: 13 }}>Schritt 3 geht, sobald die beiden Schlüssel in Supabase stehen.</p>}
      </div>
    </>
  )
}
