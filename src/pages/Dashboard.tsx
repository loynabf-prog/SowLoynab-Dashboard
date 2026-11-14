import { useEffect, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGemerkt, istGemerkt } from '../lib/merken'
import { useAuth } from '../context/AuthContext'
import { uploadLogo } from '../lib/storage'
import type { Client, Video } from '../lib/types'
import { kundenlage, type Kundenlage } from '../lib/kundenrang'
import { MARKEN, markeVon, type Marke } from '../lib/marken'
import { KUNDEN_ARTEN, artVon, istAktiv, type Kundenart } from '../lib/kundenart'
import { normHandle } from '../lib/accounts'
import Modal from '../components/Modal'
import LogoFrame from '../components/LogoFrame'
import LogoCropper from '../components/LogoCropper'
import { heute } from '../lib/datum'
import BereichReiter from '../components/BereichReiter'
import '../styles/kunden.css'
import ReichweiteBalken from '../components/ReichweiteBalken'
import { reichweite, agenturFaden, reichweiteSatz, type Reichweite } from '../lib/reichweite'

// Die Video-Zahlen kommen nicht mehr aus der Kunden-Abfrage, sondern aus
// loadCounts() — sonst zaehlt Postgres auch die geloeschten Videos mit.
type ClientWithCount = Client

// Tage bis Vertragsende (negativ = abgelaufen); null = kein Vertrag hinterlegt
function contractDaysLeft(end: string | null | undefined): number | null {
  if (!end) return null
  const d = new Date(end + 'T00:00:00')
  const n = new Date(); n.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - n.getTime()) / 86400000)
}


export default function Dashboard() {
  const { user } = useAuth()
  const [clients, setClients] = useGemerkt<ClientWithCount[]>('kunden.clients', [])
  const [videosByClient, setVideosByClient] = useGemerkt<Record<string, Video[]>>('kunden.videosByClient', {})
  const [postedMonth, setPostedMonth] = useGemerkt<Record<string, number>>('kunden.postedMonth', {})
  const [videoCount, setVideoCount] = useGemerkt<Record<string, number>>('kunden.videoCount', {})
  // Videos laut Monatseintrag (0046) fuer den laufenden Monat
  const [sollMonat, setSollMonat] = useGemerkt<Record<string, number>>('kunden.sollMonat', {})
  const [loading, setLoading] = useState(() => !istGemerkt('kunden.clients'))
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  // Welche Marke gerade gezeigt wird -- 'alle' zeigt beide.
  const [marke, setMarke] = useState<Marke | 'alle'>('alle')

  async function load() {
    setError(null)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setClients((data ?? []) as ClientWithCount[])
    setLoading(false)
  }


  // Beide Kachel-Zahlen aus EINER Abfrage — und ausschliesslich ueber Videos,
  // die nicht im Papierkorb liegen. Vorher kam die Gesamtzahl aus einer
  // eingebetteten Zaehlung (clients -> videos(count)); die zaehlt geloeschte
  // Videos mit, deshalb ging die Zahl beim Loeschen nie runter.
  async function loadCounts() {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    // Die Felder, aus denen sich Zaehlung UND Einstufung ergeben — eine
    // Abfrage fuer beides.
    const { data } = await supabase
      .from('videos')
      .select('id, client_id, status, posted_at, scheduled_date, tiktok_url, instagram_url, prep_shot, prep_edited, produktion_stufe')
      .is('deleted_at', null)
    const total: Record<string, number> = {}
    const month: Record<string, number> = {}
    const proKunde: Record<string, Video[]> = {}
    for (const v of (data ?? []) as any[]) {
      total[v.client_id] = (total[v.client_id] ?? 0) + 1
      if (v.posted_at && v.posted_at >= monthStart) month[v.client_id] = (month[v.client_id] ?? 0) + 1
      ;(proKunde[v.client_id] ??= []).push(v as Video)
    }
    const { data: mp } = await supabase.from('client_month_plans').select('client_id, quota').eq('month_key', monthStart.slice(0, 7))
    setSollMonat(Object.fromEntries(((mp ?? []) as { client_id: string; quota: number }[]).map((r) => [r.client_id, Number(r.quota)])))
    setVideoCount(total)
    setPostedMonth(month)
    setVideosByClient(proKunde)
  }

  useEffect(() => {
    load()
    loadCounts()
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => {
        load()
            loadCounts()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Jeden Kunden einstufen und innerhalb der Gruppe die dringendsten oben
  const heuteIso = heute()
  const eingestuft: { c: Client; lage: Kundenlage }[] = clients
    .filter((c) => marke === 'alle' || markeVon(c.brand) === marke)
    .map((c) => ({ c, lage: kundenlage(c, videosByClient[c.id] ?? [], heuteIso, 7, sollMonat[c.id]) }))
    .sort((a, b) => {
      const dringend = (x: Kundenlage) => (x.rang === 'akut' ? 0 : x.rang === 'laeuft' ? 1 : 2)
      const last = (x: Kundenlage) => x.zuTun + x.ohneIdee + x.ohneLink
      return dringend(a.lage) - dringend(b.lage)
        || last(b.lage) - last(a.lage)
        || a.c.name.localeCompare(b.c.name)
    })

  // Monat gesamt: gepostet / Soll ueber alle zahlenden und Ehrenamt-Kunden
  const sollVon = (c: Client) => sollMonat[c.id] ?? c.monthly_quota ?? 0
  const laufend = eingestuft.filter((x) => artVon(x.c.client_type) !== 'passiv' && !x.c.pausiert_seit && sollVon(x.c) > 0)
  const gesamtSoll = laufend.reduce((n, x) => n + sollVon(x.c), 0)
  const gesamtIst = laufend.reduce((n, x) => n + Math.min(postedMonth[x.c.id] ?? 0, sollVon(x.c)), 0)
  const monatName = new Date().toLocaleDateString('de-DE', { month: 'long' })
  const eigen = clients.find((c) => artVon(c.client_type) === 'eigen')

  // Reichweite je Kunde (gruen/gelb/rot je Tag) und daraus der Agentur-Faden:
  // je Tag der schlechteste Kunde mit Vertrag (14.11.2026).
  const monatKey = heuteIso.slice(0, 7)
  const rwVon = new Map<string, Reichweite>()
  for (const { c } of eingestuft) {
    const art = artVon(c.client_type)
    if (art === 'passiv') continue
    rwVon.set(c.id, reichweite({
      monat: monatKey, heute: heuteIso,
      ziel: c.pausiert_seit ? 0 : sollVon(c),
      videos: (videosByClient[c.id] ?? []) as any,
      mitVertrag: art === 'zahlend' || art === 'eigen',
    }))
  }
  const faden = agenturFaden(
    eingestuft.filter(({ c }) => artVon(c.client_type) === 'zahlend' && !c.pausiert_seit).map(({ c }) => rwVon.get(c.id)!).filter(Boolean),
    monatKey, heuteIso,
  )

  return (
    <div className="ku">
      {/* Kopf: nur der Monat und "+ Kunde". Titel steht schon im Reiter oben
          (Fassie, 02.11.2026: alles weg, was wir eh wissen). */}
      <div className="ku-kopf">
        <div className="ku-monat">
          <div className="ku-monat-zeile">
            <strong>{monatName}</strong>
            <span>{gesamtIst} von {gesamtSoll} Videos</span>
          </div>
          <div className="ku-balken"><i style={{ width: `${gesamtSoll ? Math.round((gesamtIst / gesamtSoll) * 100) : 0}%` }} /></div>
        </div>
        <button className="ku-neu" onClick={() => setShowAdd(true)} aria-label="Kunde anlegen"><Plus strokeWidth={2.6} /></button>
      </div>
      <BereichReiter />

      {faden.ziel > 0 && (
        <ReichweiteBalken r={faden} titel="Agentur" satz={reichweiteSatz(faden)} />
      )}

      {error && <div className="error-box" style={{ margin: '0 0 16px' }}>{error}</div>}

      {!loading && clients.length === 0 && !error && (
        <div className="empty-state">
          <p>Noch keine Kunden angelegt.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 12 }}>+ Ersten Kunden anlegen</button>
        </div>
      )}

      {(() => {
        const vorhanden = new Set(clients.map((c) => markeVon(c.brand)))
        if (vorhanden.size < 2) return null
        return (
          <div className="seg marken-filter">
            <button className={`seg-btn ${marke === 'alle' ? 'on' : ''}`} onClick={() => setMarke('alle')}>Alle</button>
            {MARKEN.map((m) => (
              <button key={m.key} className={`seg-btn ${marke === m.key ? 'on' : ''}`} onClick={() => setMarke(m.key)}>{m.kurz}</button>
            ))}
          </div>
        )
      })()}

      {/* Je Art eine Karte. Zahlend zuerst, dann Ehrenamt, Personal Brand,
          Passiv eingeklappt ganz unten. Der Ring ums Logo = Monat erfuellt,
          in der Farbe des Kunden. */}
      {KUNDEN_ARTEN.filter((a) => a.key !== 'passiv').map((art) => {
        const gruppe = eingestuft.filter((x) => artVon(x.c.client_type) === art.key)
        if (gruppe.length === 0) return null
        return (
          <section className="ku-gruppe" key={art.key}>
            <h2 className="ku-titel">{art.key === 'zahlend' ? 'Kunden' : 'Ehrenamt & Referenzen'}</h2>
            <div className="ku-karte">
              {gruppe.map(({ c, lage }) => <KundeZeile key={c.id} c={c} lage={lage} ist={postedMonth[c.id] ?? 0} soll={sollVon(c)} videos={videoCount[c.id] ?? 0} rw={rwVon.get(c.id)} />)}
            </div>
          </section>
        )
      })}

      {eigen && (
        <Link to="/brand" className="ku-karte ku-eigen">
          <span className="ku-ring" style={{ ['--f' as string]: eigen.brand_color || 'var(--akzent)' }}><span className="ku-pb">S&amp;L</span></span>
          <span className="ku-text"><strong>Personal Brand</strong><small>Unsere eigenen Accounts</small></span>
          <ChevronRight className="ku-pfeil" />
        </Link>
      )}

      {(() => {
        const passiv = eingestuft.filter((x) => artVon(x.c.client_type) === 'passiv')
        if (passiv.length === 0) return null
        return (
          <details className="ku-passiv">
            <summary>Passiv · {passiv.length}<ChevronRight /></summary>
            <div className="ku-karte">
              {passiv.map(({ c, lage }) => <KundeZeile key={c.id} c={c} lage={lage} ist={0} soll={0} videos={videoCount[c.id] ?? 0} leise />)}
            </div>
          </details>
        )
      })()}

      {showAdd && (
        <AddClientModal
          userId={user?.id ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/** Eine Kundenzeile: Logo im Fortschrittsring (Farbe des Kunden), Name, eine Zeile Stand. */
function KundeZeile({ c, lage, ist, soll, videos, leise, rw }: { c: Client; lage: Kundenlage; ist: number; soll: number; videos: number; leise?: boolean; rw?: Reichweite }) {
  const anteil = soll > 0 ? Math.min(1, ist / soll) : 0
  const dl = contractDaysLeft(c.contract_end)
  const vertrag = dl === null || dl > 30 ? null : dl < 0 ? 'Vertrag abgelaufen' : `Vertrag endet ${dl === 0 ? 'heute' : dl === 1 ? 'morgen' : `in ${dl} Tg`}`
  const R = 25, U = 2 * Math.PI * R
  return (
    <Link to={`/client/${c.id}`} className={`ku-zeile ${leise ? 'leise' : ''} ${c.pausiert_seit ? 'pause' : ''}`}>
      <span className="ku-ring" style={{ ['--f' as string]: c.brand_color || 'var(--akzent)' }}>
        {soll > 0 && (
          <svg viewBox="0 0 56 56" aria-hidden="true">
            <circle cx="28" cy="28" r={R} className="ku-ring-grund" />
            <circle cx="28" cy="28" r={R} className="ku-ring-wert" strokeDasharray={`${anteil * U} ${U}`} />
          </svg>
        )}
        <LogoFrame name={c.name} logoUrl={c.logo_url} className="ku-logo" />
      </span>
      <span className="ku-text">
        <strong>{c.name}</strong>
        <small>
          {soll > 0 ? <b className={ist >= soll ? 'gruen' : ''}>{ist}/{soll}</b> : <b>{videos} {videos === 1 ? 'Video' : 'Videos'}</b>}
          <span className={lage.rang === 'akut' && !leise ? 'akut' : ''}> · {lage.grund}</span>
        </small>
        {vertrag && !leise && <em className={dl! < 0 ? 'rot' : ''}>{vertrag}</em>}
        {rw && rw.ziel > 0 && !leise && <ReichweiteBalken r={rw} klein />}
      </span>
      <ChevronRight className="ku-pfeil" />
    </Link>
  )
}

function AddClientModal({
  userId,
  onClose,
  onSaved,
}: {
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [quota, setQuota] = useState('')
  const [contractEnd, setContractEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [neueMarke, setNeueMarke] = useState<Marke>('media')
  const [neueArt, setNeueArt] = useState<Kundenart>('zahlend')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropFile(file) // erst zuschneiden
    e.target.value = ''
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      let logo_url: string | null = null
      if (logoFile) logo_url = await uploadLogo(logoFile)
      const payload: Record<string, any> = {
        name: name.trim(),
        logo_url,
        handle_ig: ig.trim() || null,
        handle_tiktok: tiktok.trim() || null,
        brand: neueMarke,
        client_type: neueArt,
        active: istAktiv(neueArt),
        monthly_quota: quota ? Number(quota) : null,
        contract_end: contractEnd || null,
        notes: notes.trim() || null,
        created_by: userId,
      }
      // schema-sicher: fehlen contract_end oder brand noch, ohne sie erneut versuchen
      let res = await supabase.from('clients').insert(payload).select('id').single()
      if (res.error && (res.error.code === 'PGRST204' || /contract_end|brand|client_type|schema cache/i.test(res.error.message))) {
        const { contract_end, brand, client_type, ...rest } = payload
        res = await supabase.from('clients').insert(rest).select('id').single()
      }
      if (res.error) throw res.error
      const neueId = (res.data as any)?.id as string | undefined
      // Die Handles zusaetzlich als Social-Accounts anlegen. Ohne das wuerde
      // der Nachtlauf den neuen Kunden ueberspringen -- er geht die Accounts
      // durch, nicht mehr die beiden Spalten am Kunden.
      if (neueId) {
        const accs = [
          ig.trim() && { client_id: neueId, platform: 'instagram', handle: normHandle(ig), sort: 0 },
          tiktok.trim() && { client_id: neueId, platform: 'tiktok', handle: normHandle(tiktok), sort: 0 },
        ].filter(Boolean)
        if (accs.length) await supabase.from('client_accounts').insert(accs as any[])
      }
      onSaved()
      // Direkt weiter zum Content-Plan-Schritt beim neuen Kunden
      const newId = neueId
      if (newId) navigate(`/client/${newId}?onboard=1`)
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Speichern')
      setBusy(false)
    }
  }

  return (
    <Modal title="Neuen Kunden anlegen" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <div className="error-box">{error}</div>}

        <div>
          <label>Logo</label>
          <div className="logo-upload">
            <div className="preview">
              {logoPreview ? <img src={logoPreview} alt="Vorschau" /> : <span className="muted" style={{ fontSize: 11 }}>kein Logo</span>}
            </div>
            <label className="btn btn-sm" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
              Logo waehlen
              <input type="file" accept="image/*" onChange={onPickLogo} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="cname">Name *</label>
          <input id="cname" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="cig">Instagram-Handle</label>
            <input id="cig" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="restaurant_xy" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="ctt">TikTok-Handle</label>
            <input id="ctt" value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="restaurant_xy" />
          </div>
        </div>
        <div>
          <label>Kundenart</label>
          <div className="art-wahl">
            {KUNDEN_ARTEN.map((a) => (
              <button
                type="button"
                key={a.key}
                className={`art-btn ${a.key} ${neueArt === a.key ? 'on' : ''}`}
                onClick={() => setNeueArt(a.key)}
              >
                <span className="art-icon">{a.icon}</span>
                <span className="art-name">{a.kurz}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label>Marke</label>
          <div className="marken-wahl">
            {MARKEN.map((m) => (
              <button
                type="button"
                key={m.key}
                className={`marken-btn ${neueMarke === m.key ? 'on' : ''}`}
                onClick={() => setNeueMarke(m.key)}
              >
                <span className="marken-icon">{m.icon}</span>
                <span className="marken-text">
                  <span className="marken-name">{m.kurz}</span>
                  <span className="marken-hinweis">{m.hinweis}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="cquota">Videos pro Monat</label>
            <input id="cquota" value={quota} onChange={(e) => setQuota(e.target.value)} inputMode="numeric" placeholder="z. B. 10" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="cend">Vertragsende <span className="muted">(optional)</span></label>
            <input id="cend" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="cnotes">Notizen</label>
          <textarea id="cnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="info-box" style={{ fontSize: 13 }}>
          Nach dem Anlegen schlagen wir dir direkt einen <b>Content-Plan</b> vor (gleichmäßiger Rhythmus passend zu den Videos/Monat) — du kannst ihn dort anpassen.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Speichere …' : 'Anlegen & weiter'}
          </button>
        </div>
      </form>
      {cropFile && (
        <LogoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(cropped) => {
            setLogoFile(cropped)
            setLogoPreview(URL.createObjectURL(cropped))
            setCropFile(null)
          }}
        />
      )}
    </Modal>
  )
}
