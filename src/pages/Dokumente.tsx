// /dokumente: der Aktenschrank der Agentur.
// ---------------------------------------------------------------------------
// Fassie (29.10.2026): "die Gewerbeanmeldung habe ich gescannt -- ich will sie
// da hinterlegen, dass ich sie finde, wenn ich sie suche." Also: hochladen
// (Foto, Scan, PDF), Titel und Kategorie, fertig. Tipp auf eine Zeile oeffnet
// die Datei. Alles ist auch ueber die Suche (Cmd+K) findbar.
//
// Fassie (08.11.2026): "Dokumente scannen, du schaust dir an, was das ist, und
// hinterlegst es passend mit Namen." -> Scannen (mehrere Seiten = ein PDF) oder
// Datei waehlen, Claude liest es (Edge Function dokument-erkennen), vergibt
// Titel + Kategorie, fasst zusammen, legt bei Fristen eine Erinnerung an und
// schiebt Rechnungen zusaetzlich in den Dropbox-Buchhaltungseingang.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, FileText, Image as ImageIcon, File, ExternalLink, Share2, Trash2, Pencil, X, Check, Loader2, Camera, Sparkles, Images, BellRing, AlertCircle } from 'lucide-react'
import BereichReiter from '../components/BereichReiter'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import {
  KATEGORIEN, ablegenUndErkennen, aendern, erkennen, groesseText, ladeDokumente, loeschen, oeffnenUrl, scanZuPdf,
  type DokKategorie, type Dokument, type ErkennungsErgebnis,
} from '../lib/dokumente'
import '../styles/dokumente.css'

function Symbol({ d }: { d: Dokument }) {
  if (d.erkennung === 'laeuft') return <Loader2 className="spin" strokeWidth={2.2} />
  const m = d.mime ?? ''
  if (m.startsWith('image/')) return <ImageIcon strokeWidth={2} />
  if (m.includes('pdf')) return <FileText strokeWidth={2} />
  return <File strokeWidth={2} />
}

export default function Dokumente() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [liste, setListe] = useState<Dokument[] | null>(null)
  const [q, setQ] = useState('')
  const [kat, setKat] = useState<DokKategorie | 'alle'>('alle')
  const [scan, setScan] = useState<File[] | null>(null)
  const [bearbeite, setBearbeite] = useState<Dokument | null>(null)
  const datei = useRef<HTMLInputElement>(null)

  const laden = useCallback(async () => {
    try { setListe(await ladeDokumente()) } catch (e) { toast('Konnte Dokumente nicht laden: ' + (e as Error).message) }
  }, [toast])
  useEffect(() => { laden() }, [laden])

  // Solange Claude noch liest (z. B. nach Neuladen der Seite): alle 4 s nachschauen
  const liestNoch = (liste ?? []).some((d) => d.erkennung === 'laeuft')
  useEffect(() => {
    if (!liestNoch) return
    const t = window.setInterval(laden, 4000)
    return () => window.clearInterval(t)
  }, [liestNoch, laden])

  function meldung(e: ErkennungsErgebnis): string {
    const teile = [`Abgelegt: ${e.titel}`, KATEGORIEN.find((k) => k.key === e.kategorie)?.label]
    if (e.aufgabe) teile.push(`Erinnerung am ${new Date(e.aufgabe.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`)
    if (e.dropbox) teile.push('auch in der Buchhaltung')
    return teile.filter(Boolean).join(' · ')
  }

  /** Datei hochladen, Liste sofort zeigen (mit "Claude liest …"), dann Ergebnis melden. */
  async function ablegen(f: File) {
    const lauf = ablegenUndErkennen(f, user?.id)
    window.setTimeout(laden, 600)
    try {
      const r = await lauf
      toast(r.ergebnis ? meldung(r.ergebnis) : `Abgelegt als „${r.dok.titel}“ – ${r.fehler ?? 'bitte selbst benennen'}`)
    } catch (e) {
      toast('Hochladen ging nicht: ' + (e as Error).message)
    }
    laden()
  }

  // ?d=<id> aus der Suche: direkt oeffnen
  useEffect(() => {
    const id = params.get('d')
    if (!id || !liste) return
    const d = liste.find((x) => x.id === id)
    params.delete('d'); setParams(params, { replace: true })
    if (d) oeffnen(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, params])

  async function oeffnen(d: Dokument) {
    try {
      const url = await oeffnenUrl(d)
      window.open(url, '_blank', 'noopener')
    } catch (e) { toast('Konnte nicht öffnen: ' + (e as Error).message) }
  }

  async function teilen(d: Dokument) {
    try {
      const url = await oeffnenUrl(d)
      const nav = navigator as Navigator & { share?: (x: ShareData) => Promise<void> }
      if (typeof nav.share === 'function') await nav.share({ title: d.titel, url })
      else { await navigator.clipboard.writeText(url); toast('Link kopiert (10 Minuten gültig)') }
    } catch (e) { if ((e as Error).name !== 'AbortError') toast('Teilen ging nicht: ' + (e as Error).message) }
  }

  async function weg(d: Dokument) {
    if (!window.confirm(`„${d.titel}“ wirklich löschen?`)) return
    try { await loeschen(d); toast('Gelöscht'); laden() } catch (e) { toast('Konnte nicht löschen: ' + (e as Error).message) }
  }

  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (liste ?? []).filter((d) => (kat === 'alle' || d.kategorie === kat)
      && (!s || [d.titel, d.notiz, d.dateiname, d.inhalt, d.absender, d.handlung].some((x) => (x ?? '').toLowerCase().includes(s))))
  }, [liste, q, kat])

  const gruppen = useMemo(() => {
    const m = new Map<DokKategorie, Dokument[]>()
    for (const d of gefiltert) { const l = m.get(d.kategorie) ?? []; l.push(d); m.set(d.kategorie, l) }
    return KATEGORIEN.filter((k) => m.has(k.key)).map((k) => ({ ...k, liste: m.get(k.key)! }))
  }, [gefiltert])

  return (
    <div className="page">
      <BereichReiter />
      <div className="page-head">
        <div>
          <h1>Dokumente</h1>
          <span className="sub">Scannen – Claude liest, benennt und sortiert ein</span>
        </div>
      </div>

      <div className="dk-oben">
        <button className="n-tun stark dk-neu" onClick={() => setScan([])}><Camera strokeWidth={2.4} /> Scannen</button>
        <button className="n-tun dk-neu" onClick={() => datei.current?.click()}><Plus strokeWidth={2.6} /> Datei</button>
        <input ref={datei} type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" hidden onChange={(e) => {
          const fs = Array.from(e.target.files ?? []); e.target.value = ''
          fs.forEach((f) => { ablegen(f) })
        }} />
      </div>

      <label className="dk-suche">
        <Search strokeWidth={2.2} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dokument suchen …" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Leeren"><X strokeWidth={2.2} /></button>}
      </label>

      <div className="n-chips dk-chips">
        <button className={kat === 'alle' ? 'on' : ''} onClick={() => setKat('alle')}>Alle</button>
        {KATEGORIEN.map((k) => <button key={k.key} className={kat === k.key ? 'on' : ''} onClick={() => setKat(k.key)}>{k.label}</button>)}
      </div>

      {!liste ? <div className="n-leer">Lade …</div>
        : gefiltert.length === 0 ? (
          <div className="dk-leer">
            <FileText strokeWidth={1.6} />
            <strong>{liste.length === 0 ? 'Noch keine Dokumente' : 'Nichts gefunden'}</strong>
            <span>{liste.length === 0 ? 'Leg mit der Gewerbeanmeldung los: „Datei“ oder „Scannen“.' : 'Anders suchen oder Kategorie wechseln.'}</span>
          </div>
        ) : gruppen.map((g) => (
          <section key={g.key}>
            <div className="n-abschnitt"><h2>{g.label}</h2><span>{g.liste.length}</span></div>
            <div className="n-gruppe">
              {g.liste.map((d) => (
                <div key={d.id} className="n-zeile dk-zeile">
                  <span className={`n-ic ${FARBE[d.kategorie]}`}><Symbol d={d} /></span>
                  <button className="n-zeile-klick" onClick={() => oeffnen(d)}>
                    <span className="n-text">
                      <span className="n-titel">{d.titel}</span>
                      {d.erkennung === 'laeuft' ? <span className="n-unter dk-liest"><Sparkles strokeWidth={2.2} /> Claude liest das Dokument …</span>
                      : <>
                      {d.erkennung === 'fehler' && <span className="n-unter dk-fehler"><AlertCircle strokeWidth={2.2} /> Nicht erkannt – Stift tippen zum Benennen</span>}
                      <span className="n-unter">
                        {[d.betrifft && d.betrifft !== 'agentur' ? (d.betrifft === 'fassie' ? 'Fassie' : 'Lion') : null, d.notiz, groesseText(d.groesse), new Date(d.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                          d.gueltig_bis ? `gültig bis ${new Date(d.gueltig_bis + 'T12:00:00').toLocaleDateString('de-DE')}` : null].filter(Boolean).join(' · ')}
                      </span>
                      {d.frist && <span className={`dk-frist ${fristNah(d.frist) ? 'nah' : ''}`}><BellRing strokeWidth={2.4} /> {d.handlung || 'Frist'} · bis {new Date(d.frist + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                      {d.inhalt && <span className="dk-inhalt">{d.inhalt}</span>}
                      </>}
                    </span>
                  </button>
                  <div className="dk-knoepfe">
                    <button onClick={() => oeffnen(d)} aria-label="Öffnen" title="Öffnen"><ExternalLink strokeWidth={2.2} /></button>
                    <button onClick={() => teilen(d)} aria-label="Teilen" title="Teilen"><Share2 strokeWidth={2.2} /></button>
                    <button onClick={() => setBearbeite(d)} aria-label="Bearbeiten" title="Bearbeiten"><Pencil strokeWidth={2.2} /></button>
                    <button onClick={() => weg(d)} aria-label="Löschen" title="Löschen" className="rot"><Trash2 strokeWidth={2.2} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

      {scan && (
        <ScanSheet
          seiten={scan}
          setSeiten={setScan}
          onZu={() => setScan(null)}
          onLos={async () => {
            const pdf = await scanZuPdf(scan)
            setScan(null)
            await ablegen(pdf)
          }}
        />
      )}
      {bearbeite && (
        <DokSheet
          titel="Dokument bearbeiten"
          start={{ titel: bearbeite.titel, kategorie: bearbeite.kategorie, notiz: bearbeite.notiz ?? '', gueltig_bis: bearbeite.gueltig_bis ?? '' }}
          inhalt={bearbeite.inhalt}
          onNeuErkennen={async () => {
            const id = bearbeite.id
            setBearbeite(null)
            const p = erkennen(id); window.setTimeout(laden, 400)
            try { toast(meldung(await p)) } catch (e) { toast('Erkennen ging nicht: ' + (e as Error).message) }
            laden()
          }}
          onZu={() => setBearbeite(null)}
          onLos={async (w) => {
            await aendern(bearbeite.id, { titel: w.titel, kategorie: w.kategorie, notiz: w.notiz || null, gueltig_bis: w.gueltig_bis || null })
            toast('Gespeichert'); setBearbeite(null); laden()
          }}
        />
      )}
    </div>
  )
}

const FARBE: Record<DokKategorie, string> = {
  behoerde: 'blau', steuer: 'gelb', vertrag: 'lila', versicherung: 'gruen', bank: 'tinte', rechnung: 'tuerkis', vorlage: 'glut', privat: 'pink', sonstiges: 'grau',
}

function fristNah(frist: string): boolean {
  return new Date(frist + 'T12:00:00').getTime() - Date.now() < 7 * 86400000
}

/** Mehrere Seiten fotografieren -> ein PDF. */
function ScanSheet({ seiten, setSeiten, onZu, onLos }: { seiten: File[]; setSeiten: (f: File[]) => void; onZu: () => void; onLos: () => Promise<void> }) {
  const kamera = useRef<HTMLInputElement>(null)
  const fotos = useRef<HTMLInputElement>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const vorschau = useMemo(() => seiten.map((f) => URL.createObjectURL(f)), [seiten])
  useEffect(() => () => vorschau.forEach((u) => URL.revokeObjectURL(u)), [vorschau])
  // Beim Oeffnen direkt die Kamera starten
  useEffect(() => { if (seiten.length === 0) kamera.current?.click() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const dazu = (fs: FileList | null) => { const neu = Array.from(fs ?? []).filter((f) => f.type.startsWith('image/')); if (neu.length) setSeiten([...seiten, ...neu]) }
  return (
    <div className="n-sheet-hinter" onClick={onZu}>
      <div className="n-sheet dk-sheet" role="dialog" aria-label="Scannen" onClick={(e) => e.stopPropagation()}>
        <div className="n-sheet-kopf">
          <strong>Scannen</strong>
          <button className="n-sheet-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
        </div>
        <p className="n-sheet-text">Jede Seite fotografieren. Claude liest danach alles, gibt dem Dokument einen Namen und sortiert es ein.</p>
        {seiten.length > 0 && (
          <div className="dk-seiten">
            {vorschau.map((u, i) => (
              <div key={u} className="dk-seite">
                <img src={u} alt={`Seite ${i + 1}`} />
                <span>{i + 1}</span>
                <button onClick={() => setSeiten(seiten.filter((_, j) => j !== i))} aria-label="Seite entfernen"><X strokeWidth={2.6} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="dk-oben">
          <button className="n-tun dk-neu" onClick={() => kamera.current?.click()}><Camera strokeWidth={2.2} /> {seiten.length ? 'Seite dazu' : 'Foto machen'}</button>
          <button className="n-tun dk-neu" onClick={() => fotos.current?.click()}><Images strokeWidth={2.2} /> Aus Fotos</button>
        </div>
        <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { dazu(e.target.files); e.target.value = '' }} />
        <input ref={fotos} type="file" accept="image/*" multiple hidden onChange={(e) => { dazu(e.target.files); e.target.value = '' }} />
        {fehler && <div className="error-box">{fehler}</div>}
        <button className="n-tun stark n-sheet-los" disabled={laeuft || seiten.length === 0} onClick={async () => {
          setLaeuft(true); setFehler(null)
          try { await onLos() } catch (e) { setFehler((e as Error).message); setLaeuft(false) }
        }}>
          {laeuft ? <Loader2 className="spin" strokeWidth={2.4} /> : <Sparkles strokeWidth={2.4} />} {seiten.length > 1 ? `${seiten.length} Seiten ablegen` : 'Ablegen'}
        </button>
      </div>
    </div>
  )
}

interface Werte { titel: string; kategorie: DokKategorie; notiz: string; gueltig_bis: string }

function DokSheet({ titel, start, datei, inhalt, onNeuErkennen, onZu, onLos }: { titel: string; start: Werte; datei?: File; inhalt?: string | null; onNeuErkennen?: () => void; onZu: () => void; onLos: (w: Werte) => Promise<void> }) {
  const [w, setW] = useState<Werte>(start)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  return (
    <div className="n-sheet-hinter" onClick={onZu}>
      <div className="n-sheet dk-sheet" role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}>
        <div className="n-sheet-kopf">
          <strong>{titel}</strong>
          <button className="n-sheet-zu" onClick={onZu} aria-label="Schließen"><X strokeWidth={2.2} /></button>
        </div>
        {datei && <p className="n-sheet-text">{datei.name} · {groesseText(datei.size)}</p>}
        <input className="n-sheet-datum" value={w.titel} onChange={(e) => setW({ ...w, titel: e.target.value })} placeholder="Titel, z. B. Gewerbeanmeldung" autoFocus />
        <div className="n-chips dk-chips">
          {KATEGORIEN.map((k) => <button key={k.key} className={w.kategorie === k.key ? 'on' : ''} onClick={() => setW({ ...w, kategorie: k.key })}>{k.label}</button>)}
        </div>
        <p className="n-sheet-text">{KATEGORIEN.find((k) => k.key === w.kategorie)?.hinweis}</p>
        <input className="n-sheet-datum" value={w.notiz} onChange={(e) => setW({ ...w, notiz: e.target.value })} placeholder="Notiz (optional), z. B. Stadt Münster, 01.08.2026" />
        <label className="dk-gueltig">
          <span>Gültig bis <small>(optional)</small></span>
          <input type="date" className="n-sheet-datum" value={w.gueltig_bis} onChange={(e) => setW({ ...w, gueltig_bis: e.target.value })} />
        </label>
        {inhalt && <p className="n-sheet-text dk-inhalt-voll">{inhalt}</p>}
        {onNeuErkennen && <button className="n-tun dk-neu" onClick={onNeuErkennen}><Sparkles strokeWidth={2.2} /> Von Claude neu erkennen lassen</button>}
        {fehler && <div className="error-box">{fehler}</div>}
        <button className="n-tun stark n-sheet-los" disabled={laeuft || !w.titel.trim()} onClick={async () => {
          setLaeuft(true); setFehler(null)
          try { await onLos(w) } catch (e) { setFehler((e as Error).message) } finally { setLaeuft(false) }
        }}>
          {laeuft ? <Loader2 className="spin" strokeWidth={2.4} /> : <Check strokeWidth={2.6} />} {datei ? 'Ablegen' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
