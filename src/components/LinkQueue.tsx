import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { detectPlatform, klartext, lookupVideo, statsPatch } from '../lib/apify'
import { updateRow } from '../lib/db'
import type { Video } from '../lib/types'

type Row = Video & { clients?: { name: string } | null }

// Gepostete Videos, bei denen die Posting-Adresse fehlt — gesammelt an EINER
// Stelle. Das ist die haeufigste Handbewegung im Alltag, deshalb bekommt sie
// eine eigene Liste statt eines Wegs ueber Kunde -> Karte -> Feld.
//
// Bewusst EIN Feld statt zwei: welche Plattform der Link ist, erkennen wir
// selbst. Der Mensch klebt nur ein.
export default function LinkQueue() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [werte, setWerte] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('videos')
      .select('*, clients(name)')
      .eq('status', 'posted')
      .is('deleted_at', null)
      .is('tiktok_url', null)
      .is('instagram_url', null)
      .not('posted_at', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(12)
    if (error) return
    setRows((data ?? []) as unknown as Row[])
  }, [])

  useEffect(() => { load() }, [load])

  async function speichern(v: Row) {
    const url = (werte[v.id] ?? '').trim()
    if (!url) return
    const platform = detectPlatform(url)
    if (platform === 'other') {
      toast('Das sieht nicht nach einem TikTok- oder Instagram-Link aus.')
      return
    }
    setBusy(v.id)
    const felder = platform === 'tiktok' ? { tiktok_url: url } : { instagram_url: url }
    try {
      // Erst die Adresse sichern — die ist das Wertvolle. Der Abruf darf
      // scheitern, ohne dass die Eingabe verloren geht.
      const { error } = await updateRow('videos', felder, 'id', v.id)
      if (error) throw error
      setRows((prev) => prev.filter((r) => r.id !== v.id))

      const res = await lookupVideo(platform === 'tiktok' ? { tiktok_url: url } : { instagram_url: url })
      if (res.tiktok?.views == null && res.instagram?.views == null) {
        toast('Link gespeichert — Zahlen kamen noch keine. Heute Nacht erneut.')
        return
      }
      await updateRow('videos', statsPatch(res), 'id', v.id)
      const gesamt = (res.tiktok?.views ?? 0) + (res.instagram?.views ?? 0)
      toast(`${v.title}: ${gesamt.toLocaleString('de-DE')} Aufrufe ✓`)
    } catch (e) {
      toast(`Link gespeichert — ${klartext((e as Error).message).slice(0, 90)}`)
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="section-block">
      <h2 className="section-title">
        Links nachtragen
        <span className="col-count">{rows.length}</span>
      </h2>
      <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 10px' }}>
        Link einkleben — TikTok oder Instagram, wir erkennen es selbst. Ohne Adresse kommen keine Zahlen.
      </p>
      <div className="lq-list">
        {rows.map((v) => (
          <div className="lq-row" key={v.id}>
            <div className="lq-main">
              <button className="lq-title" onClick={() => navigate(`/client/${v.client_id}`)}>
                {v.title}
              </button>
              {v.clients?.name && <span className="chip">{v.clients.name}</span>}
            </div>
            <div className="lq-input">
              <input
                type="url"
                inputMode="url"
                placeholder="Link einfügen"
                value={werte[v.id] ?? ''}
                onChange={(e) => setWerte((w) => ({ ...w, [v.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                onBlur={() => speichern(v)}
                disabled={busy === v.id}
              />
              {busy === v.id && <span className="lq-busy">…</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
