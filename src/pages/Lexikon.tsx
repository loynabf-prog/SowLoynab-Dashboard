import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import {
  LEXIKON_KATEGORIEN,
  type LexikonEintrag,
  type LexikonKategorie,
  type LexikonTyp,
} from '../lib/types'

interface Opt { id: string; name: string }

// Video-Lexikon (26.10.2026, Fassie): je Branche sehr viele allgemein
// gehaltene Videoideen und wiederholbare Formate -- abgeleitet aus
// Partnerbranchen und aus dem, was in der Branche selbst funktioniert.
// Fuer einen Kunden wird daraus mit "Für Kunde übernehmen" eine Idee im
// Ideenspeicher des Kunden (video_ideas.lexikon_id), die dann konkret wird.
// Claude fuellt das Lexikon direkt in der Datenbank (lexikon_eintraege).

const ALLE = ''

function katInfo(k: LexikonKategorie | null) {
  return LEXIKON_KATEGORIEN.find((x) => x.key === k) ?? null
}

export default function Lexikon() {
  const { toast } = useToast()
  const [rows, setRows] = useState<LexikonEintrag[]>([])
  const [clients, setClients] = useState<Opt[]>([])
  const [genutzt, setGenutzt] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [fehlt, setFehlt] = useState(false)

  const [branche, setBranche] = useState<string>(ALLE)
  const [typ, setTyp] = useState<'' | LexikonTyp>('')
  const [kat, setKat] = useState<'' | LexikonKategorie>('')
  const [q, setQ] = useState('')

  const [offen, setOffen] = useState<LexikonEintrag | null>(null)
  const [bearbeiten, setBearbeiten] = useState<LexikonEintrag | 'neu' | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('lexikon_eintraege')
      .select('*')
      .is('deleted_at', null)
      .order('branche')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at')
    if (error) { setFehlt(true); setLoading(false); return }
    setRows((data ?? []) as LexikonEintrag[])
    setLoading(false)

    const { data: ideen } = await supabase
      .from('video_ideas').select('lexikon_id').not('lexikon_id', 'is', null).is('deleted_at', null)
    const m = new Map<string, number>()
    for (const r of (ideen ?? []) as { lexikon_id: string }[]) m.set(r.lexikon_id, (m.get(r.lexikon_id) ?? 0) + 1)
    setGenutzt(m)
  }

  useEffect(() => {
    load()
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name')
      .then(({ data }) => setClients((data ?? []) as Opt[]))
    const ch = supabase.channel('lexikon-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lexikon_eintraege' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const branchen = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.branche, (m.get(r.branche) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const formatName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.typ === 'format') m.set(r.id, r.titel)
    return m
  }, [rows])

  const gefiltert = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (branche && r.branche !== branche) return false
      if (typ && r.typ !== typ) return false
      if (kat && r.kategorie !== kat) return false
      if (!needle) return true
      return [r.titel, r.beschreibung, r.aufbau, r.quelle, r.branche, r.tags.join(' ')]
        .join(' ').toLowerCase().includes(needle)
    })
  }, [rows, branche, typ, kat, q])

  const formate = gefiltert.filter((r) => r.typ === 'format')
  const ideen = gefiltert.filter((r) => r.typ === 'idee')

  async function remove(e: LexikonEintrag) {
    setOffen(null)
    setRows((prev) => prev.filter((r) => r.id !== e.id))
    await supabase.from('lexikon_eintraege').update({ deleted_at: new Date().toISOString() }).eq('id', e.id)
    toast('In den Papierkorb', {
      label: 'Rückgängig',
      onClick: async () => { await supabase.from('lexikon_eintraege').update({ deleted_at: null }).eq('id', e.id); load() },
    })
  }

  const anzahlFormate = rows.filter((r) => r.typ === 'format').length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Video-Lexikon</h1>
          <span className="sub">
            {loading ? 'Lade …' : `${anzahlFormate} Formate · ${rows.length - anzahlFormate} Ideen · ${branchen.length} ${branchen.length === 1 ? 'Branche' : 'Branchen'}`}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setBearbeiten('neu')} disabled={fehlt}>+ Eintrag</button>
      </div>

      {fehlt && (
        <div className="warn-box" style={{ marginBottom: 16 }}>
          Dafür fehlt noch eine Ergänzung in der Datenbank (Skript <strong>0059_video_lexikon.sql</strong>).
          Danach ist das Lexikon sofort da.
        </div>
      )}

      {!fehlt && (
        <>
          <div className="cat-chips" style={{ marginBottom: 12 }}>
            <button type="button" className={`cat-chip ${branche === ALLE ? 'on' : ''}`} onClick={() => setBranche(ALLE)}>
              Alle Branchen
            </button>
            {branchen.map(([b, n]) => (
              <button type="button" key={b} className={`cat-chip ${branche === b ? 'on' : ''}`} onClick={() => setBranche(b)}>
                {b} <span className="muted">{n}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-row">
            <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Im Lexikon suchen …" />
            <div className="seg">
              <button className={`seg-btn ${typ === '' ? 'on' : ''}`} onClick={() => setTyp('')}>Alles</button>
              <button className={`seg-btn ${typ === 'format' ? 'on' : ''}`} onClick={() => setTyp('format')}>Formate</button>
              <button className={`seg-btn ${typ === 'idee' ? 'on' : ''}`} onClick={() => setTyp('idee')}>Ideen</button>
            </div>
            <select value={kat} onChange={(e) => setKat(e.target.value as '' | LexikonKategorie)} style={{ maxWidth: 180 }}>
              <option value="">Jede Art</option>
              {LEXIKON_KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
        </>
      )}

      {!loading && !fehlt && rows.length === 0 && (
        <div className="col-empty" style={{ padding: 30 }}>
          Das Lexikon ist noch leer. Claude füllt es je Branche mit Formaten und Ideen —
          oder leg oben mit „+ Eintrag" selbst etwas an.
        </div>
      )}

      {!loading && rows.length > 0 && gefiltert.length === 0 && (
        <div className="col-empty" style={{ padding: 30 }}>Keine Treffer.</div>
      )}

      {formate.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Formate <span className="col-count">{formate.length}</span></h2>
          <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
            Wiederholbare Serien: Aufbau bleibt, Inhalt wechselt.
          </div>
          <div className="pool-grid">
            {formate.map((r) => (
              <LexikonKarte key={r.id} e={r} genutzt={genutzt.get(r.id) ?? 0} zeigBranche={!branche}
                ideenAnzahl={rows.filter((x) => x.format_id === r.id).length} onOpen={() => setOffen(r)} />
            ))}
          </div>
        </div>
      )}

      {ideen.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Ideen <span className="col-count">{ideen.length}</span></h2>
          <div className="pool-grid">
            {ideen.map((r) => (
              <LexikonKarte key={r.id} e={r} genutzt={genutzt.get(r.id) ?? 0} zeigBranche={!branche}
                formatTitel={r.format_id ? formatName.get(r.format_id) : undefined} onOpen={() => setOffen(r)} />
            ))}
          </div>
        </div>
      )}

      {offen && (
        <DetailModal
          e={offen}
          clients={clients}
          formatTitel={offen.format_id ? formatName.get(offen.format_id) : undefined}
          ideenDesFormats={rows.filter((x) => x.format_id === offen.id)}
          genutzt={genutzt.get(offen.id) ?? 0}
          onClose={() => setOffen(null)}
          onEdit={() => { setBearbeiten(offen); setOffen(null) }}
          onDelete={() => remove(offen)}
          onOpenOther={(x) => setOffen(x)}
          onUebernommen={() => load()}
        />
      )}

      {bearbeiten && (
        <EditModal
          e={bearbeiten === 'neu' ? null : bearbeiten}
          vorgabeBranche={branche || branchen[0]?.[0] || 'Fahrschule'}
          branchen={branchen.map(([b]) => b)}
          formate={rows.filter((r) => r.typ === 'format')}
          onClose={() => setBearbeiten(null)}
          onSaved={() => { setBearbeiten(null); load() }}
        />
      )}
    </>
  )
}

function LexikonKarte({
  e, genutzt, zeigBranche, formatTitel, ideenAnzahl, onOpen,
}: {
  e: LexikonEintrag
  genutzt: number
  zeigBranche: boolean
  formatTitel?: string
  ideenAnzahl?: number
  onOpen: () => void
}) {
  const k = katInfo(e.kategorie)
  return (
    <button type="button" className="pool-card lex-card" onClick={onOpen}>
      <div className="pool-card-head">
        <span className="lex-badges">
          <span className={`pool-badge ${e.typ === 'format' ? 'ai' : ''}`}>{e.typ === 'format' ? 'Format' : 'Idee'}</span>
          {k && <span className="pool-badge" style={{ background: `${k.farbe}22`, color: k.farbe }}>{k.label}</span>}
          {zeigBranche && <span className="pool-badge">{e.branche}</span>}
        </span>
        {genutzt > 0 && <span className="muted" style={{ fontSize: 12 }}>{genutzt}× genutzt</span>}
      </div>
      <div className="pool-title">{e.titel}</div>
      {e.beschreibung && <div className="pool-notes">{e.beschreibung}</div>}
      <div className="lex-meta">
        {e.quelle && <span>aus: {e.quelle}</span>}
        {formatTitel && <span>Format: {formatTitel}</span>}
        {ideenAnzahl != null && ideenAnzahl > 0 && <span>{ideenAnzahl} {ideenAnzahl === 1 ? 'Idee' : 'Ideen'}</span>}
      </div>
    </button>
  )
}

function DetailModal({
  e, clients, formatTitel, ideenDesFormats, genutzt, onClose, onEdit, onDelete, onOpenOther, onUebernommen,
}: {
  e: LexikonEintrag
  clients: Opt[]
  formatTitel?: string
  ideenDesFormats: LexikonEintrag[]
  genutzt: number
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenOther: (x: LexikonEintrag) => void
  onUebernommen: () => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [kunde, setKunde] = useState('')
  const [busy, setBusy] = useState(false)
  const k = katInfo(e.kategorie)

  async function uebernehmen() {
    if (!kunde) return
    setBusy(true)
    const notes = [
      e.beschreibung,
      e.aufbau ? `Aufbau:\n${e.aufbau}` : null,
      `Aus dem Video-Lexikon (${e.branche}${e.typ === 'format' ? ', Format' : ''}) — für diesen Kunden konkret machen.`,
    ].filter(Boolean).join('\n\n')
    const { error } = await supabase.from('video_ideas').insert({
      client_id: kunde, title: e.titel, notes, source: 'lexikon', lexikon_id: e.id, created_by: user?.id ?? null,
    })
    setBusy(false)
    if (error) { toast(`Fehler: ${error.message}`); return }
    toast(`Im Ideenspeicher von ${clients.find((c) => c.id === kunde)?.name ?? 'Kunde'}`)
    setKunde('')
    onUebernommen()
  }

  return (
    <Modal title={e.titel} onClose={onClose}>
      <div className="stack">
        <div className="lex-badges">
          <span className={`pool-badge ${e.typ === 'format' ? 'ai' : ''}`}>{e.typ === 'format' ? 'Format' : 'Idee'}</span>
          {k && <span className="pool-badge" style={{ background: `${k.farbe}22`, color: k.farbe }}>{k.label}</span>}
          <span className="pool-badge">{e.branche}</span>
          {genutzt > 0 && <span className="muted" style={{ fontSize: 12 }}>{genutzt}× genutzt</span>}
        </div>

        {e.beschreibung && <Feld titel="Idee">{e.beschreibung}</Feld>}
        {e.aufbau && <Feld titel="Aufbau">{e.aufbau}</Feld>}
        {e.quelle && <Feld titel="Herkunft">{e.quelle}</Feld>}
        {formatTitel && <Feld titel="Gehört zum Format">{formatTitel}</Feld>}
        {e.belege && <Feld titel="Belege & Beispiele"><Belege text={e.belege} /></Feld>}
        {e.tags.length > 0 && <Feld titel="Stichworte">{e.tags.join(', ')}</Feld>}

        {ideenDesFormats.length > 0 && (
          <Feld titel={`Ideen zu diesem Format (${ideenDesFormats.length})`}>
            <div className="lex-liste">
              {ideenDesFormats.map((x) => (
                <button key={x.id} type="button" className="lex-link" onClick={() => onOpenOther(x)}>{x.titel}</button>
              ))}
            </div>
          </Feld>
        )}

        <div className="info-box">
          <label style={{ marginTop: 0 }}>Für Kunde übernehmen</label>
          <div className="row" style={{ gap: 8 }}>
            <select value={kunde} onChange={(ev) => setKunde(ev.target.value)} style={{ flex: 1 }}>
              <option value="">Kunde wählen …</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!kunde || busy} onClick={uebernehmen}>
              {busy ? '…' : 'In Ideenspeicher'}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={onDelete}>Löschen</button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onEdit}>Bearbeiten</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </Modal>
  )
}

function Feld({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <label>{titel}</label>
      <div className="lex-text">{children}</div>
    </div>
  )
}

// Belege: je Zeile ein Beispiel -- Links werden klickbar.
function Belege({ text }: { text: string }) {
  return (
    <div className="lex-liste">
      {text.split('\n').filter((z) => z.trim()).map((z, i) => {
        const m = z.match(/https?:\/\/\S+/)
        if (!m) return <div key={i}>{z}</div>
        const vor = z.slice(0, m.index).trim()
        return (
          <div key={i}>
            {vor && <span>{vor} </span>}
            <a href={m[0]} target="_blank" rel="noreferrer">ansehen ↗</a>
          </div>
        )
      })}
    </div>
  )
}

function EditModal({
  e, vorgabeBranche, branchen, formate, onClose, onSaved,
}: {
  e: LexikonEintrag | null
  vorgabeBranche: string
  branchen: string[]
  formate: LexikonEintrag[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [branche, setBranche] = useState(e?.branche ?? vorgabeBranche)
  const [typ, setTyp] = useState<LexikonTyp>(e?.typ ?? 'idee')
  const [titel, setTitel] = useState(e?.titel ?? '')
  const [beschreibung, setBeschreibung] = useState(e?.beschreibung ?? '')
  const [aufbau, setAufbau] = useState(e?.aufbau ?? '')
  const [kategorie, setKategorie] = useState<LexikonKategorie | null>(e?.kategorie ?? null)
  const [quelle, setQuelle] = useState(e?.quelle ?? '')
  const [formatId, setFormatId] = useState(e?.format_id ?? '')
  const [belege, setBelege] = useState(e?.belege ?? '')
  const [tags, setTags] = useState((e?.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passendeFormate = formate.filter((f) => f.branche === branche.trim() && f.id !== e?.id)

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (!titel.trim() || !branche.trim()) return
    setBusy(true)
    const row = {
      branche: branche.trim(),
      typ,
      titel: titel.trim(),
      beschreibung: beschreibung.trim() || null,
      aufbau: aufbau.trim() || null,
      kategorie,
      quelle: quelle.trim() || null,
      format_id: typ === 'idee' && formatId ? formatId : null,
      belege: belege.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    const { error } = e
      ? await supabase.from('lexikon_eintraege').update(row).eq('id', e.id)
      : await supabase.from('lexikon_eintraege').insert({ ...row, created_by: user?.id ?? null })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal title={e ? 'Eintrag bearbeiten' : 'Neuer Lexikon-Eintrag'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Branche *</label>
            <input value={branche} onChange={(ev) => setBranche(ev.target.value)} list="lex-branchen" required placeholder="z. B. Fahrschule" />
            <datalist id="lex-branchen">{branchen.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <div style={{ flex: 1 }}>
            <label>Art</label>
            <div className="seg">
              <button type="button" className={`seg-btn ${typ === 'idee' ? 'on' : ''}`} onClick={() => setTyp('idee')}>Idee</button>
              <button type="button" className={`seg-btn ${typ === 'format' ? 'on' : ''}`} onClick={() => setTyp('format')}>Format</button>
            </div>
          </div>
        </div>
        <div>
          <label>Titel *</label>
          <input value={titel} onChange={(ev) => setTitel(ev.target.value)} required autoFocus
            placeholder={typ === 'format' ? 'z. B. Geheimtipp vom Fahrlehrer' : 'z. B. Bekannter Kreisel der Stadt erklärt'} />
        </div>
        <div>
          <label>Idee <span className="muted">(allgemein, ohne Kunde und Stadt)</span></label>
          <textarea value={beschreibung} onChange={(ev) => setBeschreibung(ev.target.value)}
            placeholder="z. B. Fahrlehrer steht an einem Ort, den jeder in der Stadt kennt, und erklärt die Gefahren dort." />
        </div>
        <div>
          <label>Aufbau</label>
          <textarea value={aufbau} onChange={(ev) => setAufbau(ev.target.value)} placeholder="Hook → … → CTA" />
        </div>
        <div>
          <label>Wirkung</label>
          <div className="cat-chips">
            <button type="button" className={`cat-chip ${!kategorie ? 'on' : ''}`} onClick={() => setKategorie(null)}>
              <span className="cat-swatch" style={{ background: 'var(--border-strong)' }} />Offen
            </button>
            {LEXIKON_KATEGORIEN.map((k) => (
              <button type="button" key={k.key} className={`cat-chip ${kategorie === k.key ? 'on' : ''}`} onClick={() => setKategorie(k.key)}>
                <span className="cat-swatch" style={{ background: k.farbe }} />{k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Herkunft <span className="muted">(Partnerbranche)</span></label>
            <input value={quelle} onChange={(ev) => setQuelle(ev.target.value)} placeholder="z. B. Piloten" />
          </div>
          {typ === 'idee' && (
            <div style={{ flex: 1 }}>
              <label>Gehört zum Format</label>
              <select value={formatId} onChange={(ev) => setFormatId(ev.target.value)}>
                <option value="">— keinem —</option>
                {passendeFormate.map((f) => <option key={f.id} value={f.id}>{f.titel}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label>Belege & Beispiele <span className="muted">(je Zeile eins, gern mit Link)</span></label>
          <textarea value={belege} onChange={(ev) => setBelege(ev.target.value)} />
        </div>
        <div>
          <label>Stichworte <span className="muted">(mit Komma getrennt)</span></label>
          <input value={tags} onChange={(ev) => setTags(ev.target.value)} placeholder="z. B. Ort, Fahrlehrer, Prüfung" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !titel.trim() || !branche.trim()}>
            {busy ? 'Speichere …' : e ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
