// Personal Brand: unsere eigenen Accounts, getrennt von den Kunden.
// -------------------------------------------------------------------------
// Technisch ist es ein Kunde der Art 'eigen' (clients.client_type) mit den
// Accounts als Kanaelen (Agentur, Fassie, Lion). So laufen Plan, Posten,
// Link-Abholung und Analyse genauso wie bei Kunden -- in der Oberflaeche aber
// als eigener Bereich: Dieser Monat, Accounts, Leads je Account.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3, Users, CalendarDays, Check, Target } from 'lucide-react'
import AppIcon, { AppRaster } from '../components/AppIcon'
import { supabase } from '../lib/supabase'
import { ladeKanaele, type Channel } from '../lib/channels'
import { ladeAccounts, letzterStandJeAccount, profilUrl, type ClientAccount } from '../lib/accounts'
import { ladeMonatsmengen, mengeFuer } from '../lib/monatsmenge'
import { heute as heuteIso } from '../lib/datum'
import { kurzZahl } from '../lib/analyse'
import { schnellGepostet } from '../lib/videoAktionen'
import { ABGEBROCHEN } from '../lib/betriebWahl'
import { useToast } from '../context/ToastContext'

interface Eigen { id: string; name: string; monthly_quota: number | null }
interface V {
  id: string; title: string | null; status: string; scheduled_date: string | null; scheduled_time: string | null
  channel_id: string | null; posted_at: string | null; views: number | null
}
interface L { id: string; stage: string; source: string | null; quelle_kanal_id: string | null }


function tagKurz(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function PersonalBrand() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [eigen, setEigen] = useState<Eigen | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [kanaele, setKanaele] = useState<Channel[]>([])
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [follower, setFollower] = useState<Map<string, number>>(new Map())
  const [videos, setVideos] = useState<V[]>([])
  const [leads, setLeads] = useState<L[]>([])
  const [soll, setSoll] = useState(0)

  const tag = heuteIso()
  const monat = tag.slice(0, 7)

  async function laden() {
    const { data: c } = await supabase.from('clients').select('id, name, monthly_quota')
      .eq('client_type', 'eigen').is('deleted_at', null).order('created_at').limit(1).maybeSingle()
    if (!c) { setLaedt(false); return }
    const e = c as Eigen
    setEigen(e)
    const seit30 = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [k, a, mengen, v, st, ld] = await Promise.all([
      ladeKanaele(e.id).catch(() => ({ kanaele: [] as Channel[] })),
      ladeAccounts(e.id).catch(() => ({ accounts: [] as ClientAccount[] })),
      ladeMonatsmengen(e.id),
      supabase.from('videos').select('id, title, status, scheduled_date, scheduled_time, channel_id, posted_at, views')
        .eq('client_id', e.id).is('deleted_at', null)
        .or(`scheduled_date.gte.${monat}-01,posted_at.gte.${seit30}`)
        .order('scheduled_date', { ascending: true }),
      supabase.from('client_stats').select('account_id, followers_ig, followers_tiktok, captured_on')
        .eq('client_id', e.id).order('captured_on', { ascending: true }),
      supabase.from('leads').select('id, stage, source, quelle_kanal_id').is('deleted_at', null),
    ])
    setKanaele(k.kanaele)
    setAccounts(a.accounts)
    setSoll(mengeFuer(e.monthly_quota, monat, mengen))
    setVideos((v.data ?? []) as V[])
    setFollower(letzterStandJeAccount((st.data ?? []) as any[]))
    setLeads((ld.data ?? []) as L[])
    setLaedt(false)
  }

  useEffect(() => { laden() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const imMonat = useMemo(() => videos.filter((v) => v.scheduled_date?.startsWith(monat)), [videos, monat])
  const gepostet = imMonat.filter((v) => v.status === 'posted').length
  const kommend = imMonat.filter((v) => v.status !== 'posted')
  const kanalVon = (id: string | null) => kanaele.find((k) => k.id === id) ?? null

  if (laedt) return <div className="n-leer">Lade …</div>
  if (!eigen) {
    return (
      <>
        <h1 className="h-gruss">Personal Brand</h1>
        <div className="n-gruppe"><div className="n-leer">Noch kein eigener Bereich angelegt.</div></div>
      </>
    )
  }

  const akte = `/client/${eigen.id}`
  const ohneZuordnung = leads.filter((l) => !l.quelle_kanal_id && (l.source === 'Instagram' || l.source === 'TikTok')).length

  return (
    <>
      <h1 className="h-gruss">Personal Brand</h1>

      <AppRaster>
        <AppIcon icon={CalendarDays} farbe="glut" titel="Plan" onClick={() => navigate(akte)} />
        <AppIcon icon={Check} farbe="gruen" titel="Gepostet" onClick={async () => {
          const f = await schnellGepostet(eigen.id)
          if (f === ABGEBROCHEN) return
          if (f) { toast('Konnte nicht speichern: ' + f); return }
          toast('Gepostet')
          laden()
        }} />
        <AppIcon icon={BarChart3} farbe="lila" titel="Analyse" onClick={() => navigate(`/analyse?kunde=${eigen.id}`)} />
        <AppIcon icon={Target} farbe="tuerkis" titel="Leads" badge={leads.filter((l) => l.quelle_kanal_id && l.stage !== 'won' && l.stage !== 'lost').length} onClick={() => navigate('/leads')} />
      </AppRaster>

      {/* ----------------------------------------------------- Dieser Monat */}
      <div className="n-abschnitt"><h2>Dieser Monat</h2><span>{gepostet}/{soll || '–'}</span></div>
      <div className="n-gruppe">
        <div className="n-zeile">
          <div className="pb-balken"><i style={{ width: soll ? `${Math.min(100, (gepostet / soll) * 100)}%` : '0%' }} /></div>
        </div>
        {kommend.length === 0 ? (
          <div className="n-leer">{soll && gepostet < soll ? `${soll - gepostet} fehlen` : '✓'}</div>
        ) : kommend.map((v) => {
          const k = kanalVon(v.channel_id)
          const verpasst = !!v.scheduled_date && v.scheduled_date < tag
          return (
            <button key={v.id} type="button" className="n-zeile a-tipp" onClick={() => navigate(`${akte}?video=${v.id}&open=1`)}>
              <span className="pb-punkt" style={{ background: k?.color ?? 'var(--line)' }} />
              <span className="n-text">
                <span className="n-titel">{v.title || 'Video'}</span>
                <span className="n-unter">{[k?.name, v.scheduled_date ? tagKurz(v.scheduled_date) : 'ohne Datum', v.scheduled_time?.slice(0, 5)].filter(Boolean).join(' · ')}</span>
              </span>
              {verpasst ? <span className="pb-rot">verpasst</span> : <ChevronRight className="n-chevron" />}
            </button>
          )
        })}
      </div>

      {/* --------------------------------------------------------- Accounts */}
      <div className="n-abschnitt"><h2>Accounts</h2></div>
      <div className="pb-accounts">
        {kanaele.map((k) => {
          const accs = accounts.filter((a) => a.channel_id === k.id)
          const fol = accs.reduce((s, a) => s + (follower.get(a.id) ?? 0), 0)
          const posts = imMonat.filter((v) => v.channel_id === k.id && v.status === 'posted').length
          const views30 = videos.filter((v) => v.channel_id === k.id && v.posted_at).reduce((s, v) => s + (v.views ?? 0), 0)
          const leadsHier = leads.filter((l) => l.quelle_kanal_id === k.id)
          return (
            <div key={k.id} className="pb-account">
              <div className="pb-account-kopf">
                <span className="pb-punkt" style={{ background: k.color }} />
                <strong>{k.name}</strong>
              </div>
              {accs.length === 0 ? (
                <button type="button" className="pb-fehlt" onClick={() => navigate(akte)}>+ Handle</button>
              ) : (
                <div className="pb-handles">
                  {accs.map((a) => (
                    <a key={a.id} href={profilUrl(a.platform, a.handle)} target="_blank" rel="noopener noreferrer">
                      {a.platform === 'tiktok' ? 'TikTok' : 'IG'} @{a.handle}
                    </a>
                  ))}
                </div>
              )}
              <div className="pb-werte">
                <span><b>{fol ? kurzZahl(fol) : '–'}</b>Follower</span>
                <span><b>{posts}</b>Posts</span>
                <span><b>{views30 ? kurzZahl(views30) : '–'}</b>Views</span>
                <span><b>{leadsHier.length}</b>Leads</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------------------ Leads */}
      <div className="n-abschnitt"><h2>Leads</h2></div>
      <div className="n-gruppe">
        {kanaele.map((k) => {
          const hier = leads.filter((l) => l.quelle_kanal_id === k.id)
          return (
            <Link key={k.id} to="/leads" className="n-zeile">
              <span className="pb-punkt" style={{ background: k.color }} />
              <span className="n-text">
                <span className="n-titel">{k.name}</span>
              </span>
              <span className="a-wert">{hier.length}</span>
            </Link>
          )
        })}
        {ohneZuordnung > 0 && (
          <Link to="/leads" className="n-zeile">
            <span className="n-ic grau"><Users strokeWidth={2.2} /></span>
            <span className="n-text">
              <span className="n-titel">Ohne Account</span>
            </span>
            <span className="a-wert">{ohneZuordnung}</span>
          </Link>
        )}
      </div>

    </>
  )
}
