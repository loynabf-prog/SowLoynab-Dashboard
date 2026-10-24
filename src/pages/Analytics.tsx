// Analyse: was funktioniert bei unseren Videos?
// ---------------------------------------------------------------------------
// Alles kommt aus Daten, die wir ohnehin abrufen (Sicht video_analyse,
// Migration 0044) -- kein zusaetzlicher Apify-Abruf. Die Rechnungen stecken
// in lib/analyse.ts, hier wird nur gezeigt.
//
// Aufbau von oben nach unten -- vom Ueberblick zur Handlung:
//   Lage          wie viele Videos, Views, Follower, Quoten
//   Beste Zeit    wann posten (Wochentag x Tageszeit)
//   Was wirkt     Frage in der Caption? Originalton? kurz oder lang? ...
//   Top-Videos    mit Vorschaubild, umschaltbar
//   Spaetzuender  Videos, die nach Tag 1 noch stark gewachsen sind
//   Sounds        mehrfach genutzte TikTok-Sounds
//   Kunden        Videos, Ø Views und Follower je Kunde

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, TrendingUp, Music, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { nurGesamt } from '../lib/accounts'
import { MARKEN, markeVon, type Marke } from '../lib/marken'
import LogoFrame from '../components/LogoFrame'
import {
  normalisiere, indexJeVideo, zeitRaster, besteZeit, nachTageszeit, vergleiche, plattformVerhaeltnis,
  topVideos, spaetzuender, sounds, imZeitraum, median, faktorText, prozentText, kurzZahl,
  proMonat, monatsLabel, followerVerlauf,
  BLOECKE, TAGE, TAGE_LANG, type AnalyseVideo, type Sortierung,
} from '../lib/analyse'
import LineChart from '../components/LineChart'
import BereichReiter from '../components/BereichReiter'

interface Kunde { id: string; name: string; logo_url: string | null; brand: string | null }
interface StatRow { client_id: string; captured_on: string; followers_ig: number | null; followers_tiktok: number | null; account_id?: string | null }

const ZEITRAEUME = [
  { key: '30', label: '30 Tage', tage: 30 },
  { key: '90', label: '90 Tage', tage: 90 },
  { key: 'alle', label: 'Alles', tage: null },
] as const

function datumKurz(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function linkVon(v: AnalyseVideo): string | null {
  return v.tiktok_url ?? v.instagram_url ?? null
}

export default function Analytics() {
  const navigate = useNavigate()
  const [roh, setRoh] = useState<AnalyseVideo[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeitraum, setZeitraum] = useState<(typeof ZEITRAEUME)[number]['key']>('90')
  const [kunde, setKunde] = useState<string | null>(null)
  const [marke, setMarke] = useState<Marke | 'alle'>('alle')
  const [sortierung, setSortierung] = useState<Sortierung>('index')

  useEffect(() => {
    Promise.all([
      supabase.from('video_analyse').select('*'),
      supabase.from('clients').select('id, name, logo_url, brand').is('deleted_at', null),
      supabase.from('client_stats').select('client_id, captured_on, account_id, followers_ig, followers_tiktok').order('captured_on', { ascending: true }),
    ]).then(([v, k, s]) => {
      if (v.error) setFehler(v.error.message)
      setRoh(((v.data ?? []) as Record<string, unknown>[]).map(normalisiere))
      setKunden((k.data ?? []) as Kunde[])
      setStats(nurGesamt((s.data ?? []) as StatRow[]))
      setLoading(false)
    })
  }, [])

  const kundeVon = useMemo(() => new Map(kunden.map((k) => [k.id, k])), [kunden])
  // Videos geloeschter Kunden fallen raus (die stehen nicht in "kunden").
  const alle = useMemo(() => roh.filter((v) => kundeVon.has(v.client_id)), [roh, kundeVon])
  // Index immer gegen ALLE Videos des Kunden -- sonst verschiebt der
  // Zeitraum-Filter den Massstab.
  const idx = useMemo(() => indexJeVideo(alle), [alle])

  const markenDa = useMemo(() => new Set(alle.map((v) => markeVon(kundeVon.get(v.client_id)?.brand))), [alle, kundeVon])
  const tage = ZEITRAEUME.find((z) => z.key === zeitraum)!.tage

  const videos = useMemo(() => alle.filter((v) => {
    if (!imZeitraum(v, tage)) return false
    if (kunde && v.client_id !== kunde) return false
    if (marke !== 'alle' && markeVon(kundeVon.get(v.client_id)?.brand) !== marke) return false
    return true
  }), [alle, tage, kunde, marke, kundeVon])

  // Kunden-Chips: nur Kunden mit Videos im Zeitraum, meiste zuerst
  const kundenChips = useMemo(() => {
    const n = new Map<string, number>()
    for (const v of alle) if (imZeitraum(v, tage)) n.set(v.client_id, (n.get(v.client_id) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id, anzahl]) => ({ id, anzahl, name: kundeVon.get(id)?.name ?? 'Kunde' }))
  }, [alle, tage, kundeVon])

  // ------------------------------------------------------------ Lage
  const lage = useMemo(() => {
    const views = videos.reduce((s, v) => s + (v.views ?? 0), 0)
    const er = median(videos.map((v) => v.engagement_rate_tiktok).filter((x): x is number => x != null))
    const sr = median(videos.map((v) => v.share_rate_tiktok).filter((x): x is number => x != null))
    const vpf = median(videos.map((v) => v.views_pro_follower_tiktok ?? v.views_pro_follower_ig).filter((x): x is number => x != null))
    return { anzahl: videos.length, views, schnitt: videos.length ? views / videos.length : null, er, sr, vpf }
  }, [videos])

  // Follower: letzter bekannter Stand je Plattform und Kunde + Veraenderung in 30 Tagen
  const follower = useMemo(() => {
    const relevant = new Set(kunde ? [kunde] : [...kundeVon.keys()].filter((id) => marke === 'alle' || markeVon(kundeVon.get(id)?.brand) === marke))
    const grenze = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const jetzt = new Map<string, { ig: number | null; tt: number | null }>()
    const vorher = new Map<string, { ig: number | null; tt: number | null }>()
    for (const r of stats) {
      if (!relevant.has(r.client_id)) continue
      const a = jetzt.get(r.client_id) ?? { ig: null, tt: null }
      jetzt.set(r.client_id, { ig: r.followers_ig ?? a.ig, tt: r.followers_tiktok ?? a.tt })
      if (r.captured_on <= grenze) {
        const b = vorher.get(r.client_id) ?? { ig: null, tt: null }
        vorher.set(r.client_id, { ig: r.followers_ig ?? b.ig, tt: r.followers_tiktok ?? b.tt })
      }
    }
    let summe = 0, alt = 0, vergleichbar = false
    for (const [id, w] of jetzt) {
      summe += (w.ig ?? 0) + (w.tt ?? 0)
      const v = vorher.get(id)
      if (v && (v.ig != null || v.tt != null)) {
        vergleichbar = true
        // nur Plattformen vergleichen, die es damals schon gab
        alt += (v.ig != null ? v.ig : w.ig ?? 0) + (v.tt != null ? v.tt : w.tt ?? 0)
      } else {
        alt += (w.ig ?? 0) + (w.tt ?? 0)
      }
    }
    return { summe, plus: vergleichbar ? summe - alt : null, proKunde: jetzt }
  }, [stats, kunde, marke, kundeVon])

  // ------------------------------------------------------- Auswertungen
  const raster = useMemo(() => zeitRaster(videos, idx), [videos, idx])
  const beste = useMemo(() => besteZeit(raster), [raster])
  const tageszeit = useMemo(() => nachTageszeit(videos, idx), [videos, idx])
  const mitZeit = useMemo(() => videos.filter((v) => v.zeit_echt !== false).length, [videos])
  const vgl = useMemo(() => vergleiche(videos, idx), [videos, idx])
  const plattform = useMemo(() => plattformVerhaeltnis(videos), [videos])
  const top = useMemo(() => topVideos(videos, idx, sortierung, 6), [videos, idx, sortierung])
  const spaet = useMemo(() => spaetzuender(videos, 5), [videos])
  const sound = useMemo(() => sounds(videos, idx).slice(0, 5), [videos, idx])

  const proKunde = useMemo(() => {
    const m = new Map<string, { anzahl: number; views: number }>()
    for (const v of videos) {
      const e = m.get(v.client_id) ?? { anzahl: 0, views: 0 }
      e.anzahl++
      e.views += v.views ?? 0
      m.set(v.client_id, e)
    }
    return [...m.entries()].map(([id, e]) => ({ id, ...e, kunde: kundeVon.get(id)! })).sort((a, b) => b.views - a.views)
  }, [videos, kundeVon])

  // ------------------------------------------------------- Entwicklung
  const monate = useMemo(() => proMonat(videos), [videos])
  const maxMonat = useMemo(() => Math.max(1, ...monate.map((m) => m.views)), [monate])
  const fKurve = useMemo(() => {
    const relevant = new Set(kunde ? [kunde] : [...kundeVon.keys()].filter((id) => marke === 'alle' || markeVon(kundeVon.get(id)?.brand) === marke))
    const ab = tage == null ? null : new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10)
    return followerVerlauf(stats, relevant, ab)
  }, [stats, kunde, marke, kundeVon, tage])

  const maxIndex = useMemo(() => {
    let m = 1
    for (let t = 1; t <= 7; t++) for (const b of BLOECKE) { const z = raster[t][b.key]; if (z.n >= 2 && z.index != null) m = Math.max(m, z.index) }
    return m
  }, [raster])

  const besteTageszeit = useMemo(() => {
    const kandidaten = tageszeit.filter((t) => t.n >= 3 && t.index != null)
    return kandidaten.sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0] ?? null
  }, [tageszeit])

  return (
    <>
      <div className="h-datum">{loading ? 'Lade …' : 'Was bei unseren Videos funktioniert'}</div>
      <h1 className="h-gruss">Analyse</h1>
      <BereichReiter />
      {fehler && <div className="n-gruppe"><div className="n-leer">Konnte nicht laden: {fehler}</div></div>}

      <div className="n-segment" role="tablist" aria-label="Zeitraum">
        {ZEITRAEUME.map((z) => (
          <button key={z.key} className={zeitraum === z.key ? 'on' : ''} onClick={() => setZeitraum(z.key)}>{z.label}</button>
        ))}
      </div>

      {markenDa.size > 1 && (
        <div className="n-chips" aria-label="Marke">
          <button className={marke === 'alle' ? 'on' : ''} onClick={() => setMarke('alle')}>Beide Marken</button>
          {MARKEN.map((m) => (
            <button key={m.key} className={marke === m.key ? 'on' : ''} onClick={() => { setMarke(m.key); setKunde(null) }}>{m.kurz}</button>
          ))}
        </div>
      )}

      {kundenChips.length > 1 && (
        <div className="n-chips" aria-label="Kunde">
          <button className={!kunde ? 'on' : ''} onClick={() => setKunde(null)}>Alle Kunden</button>
          {kundenChips
            .filter((c) => marke === 'alle' || markeVon(kundeVon.get(c.id)?.brand) === marke)
            .map((c) => (
              <button key={c.id} className={kunde === c.id ? 'on' : ''} onClick={() => setKunde(kunde === c.id ? null : c.id)}>
                {c.name}<small>{c.anzahl}</small>
              </button>
            ))}
        </div>
      )}

      {/* ------------------------------------------------------------ Lage */}
      <div className="p-lage">
        <div><strong>{lage.anzahl}</strong><span>Videos</span></div>
        <div><strong>{kurzZahl(lage.views)}</strong><span>Views</span></div>
        <div><strong>{kurzZahl(lage.schnitt)}</strong><span>Ø pro Video</span></div>
      </div>
      <div className="p-lage">
        <div title="Likes, Kommentare, Shares und Saves geteilt durch Views (TikTok, Median)">
          <strong>{prozentText(lage.er)}</strong><span>Engagement</span>
        </div>
        <div title="Wie viele Zuschauer das Video weiterschicken (TikTok, Median)">
          <strong>{prozentText(lage.sr, 2)}</strong><span>Share-Rate</span>
        </div>
        <div title="Views geteilt durch Follower beim Posten (Median). Über 1 = über die eigene Community hinaus.">
          <strong>{lage.vpf == null ? '–' : faktorText(lage.vpf)}</strong><span>pro Follower</span>
        </div>
      </div>
      {follower.summe > 0 && (
        <div className="a-follower">
          <span>{kurzZahl(follower.summe)} Follower</span>
          {follower.plus != null && follower.plus !== 0 && (
            <b className={follower.plus > 0 ? 'gruen' : 'rot'}>{follower.plus > 0 ? '+' : '−'}{kurzZahl(Math.abs(follower.plus))} in 30 Tagen</b>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- Entwicklung */}
      {monate.length > 0 && (
        <>
          <div className="n-abschnitt"><h2>Entwicklung</h2><span>Views nach Monat der Veröffentlichung</span></div>
          <div className="n-gruppe a-karte">
            <div className="a-legende">
              <span><i className="tt" /> TikTok</span>
              <span><i className="ig" /> Instagram</span>
            </div>
            <div className="a-monate">
              {monate.map((m) => (
                <div key={m.monat} className="a-monat" title={`${monatsLabel(m.monat)}: ${m.anzahl} Videos · TikTok ${kurzZahl(m.tiktok)} · Instagram ${kurzZahl(m.ig)}`}>
                  <span className="a-monat-name">{monatsLabel(m.monat)}</span>
                  <span className="a-balken">
                    <i className="tt" style={{ width: `${(m.tiktok / maxMonat) * 100}%` }} />
                    <i className="ig" style={{ width: `${(m.ig / maxMonat) * 100}%` }} />
                  </span>
                  <span className="a-monat-wert"><b>{kurzZahl(m.views)}</b><small>{m.anzahl} {m.anzahl === 1 ? 'Video' : 'Videos'} · Ø {kurzZahl(m.schnitt)}</small></span>
                </div>
              ))}
            </div>
            {(fKurve.tiktok.length > 1 || fKurve.ig.length > 1) && (
              <>
                <p className="a-zwischen">Follower</p>
                <LineChart series={[
                  ...(fKurve.tiktok.length > 1 ? [{ key: 'tt', label: 'TikTok', color: 'var(--ink)', points: fKurve.tiktok }] : []),
                  ...(fKurve.ig.length > 1 ? [{ key: 'ig', label: 'Instagram', color: '#af52de', points: fKurve.ig }] : []),
                ]} />
              </>
            )}
            <p className="a-fuss">Views = heutiger Stand aller Videos des Monats. Follower: wöchentlich, nur Accounts, die schon am Anfang des Zeitraums gemessen wurden.</p>
          </div>
        </>
      )}

      {/* -------------------------------------------------------- Beste Zeit */}
      <div className="n-abschnitt"><h2>Beste Zeit</h2><span>{mitZeit} Videos mit echter Uhrzeit</span></div>
      <div className="n-gruppe a-karte">
        {beste ? (
          <p className="a-satz">
            <Clock /><span>Am besten lief bisher <b>{TAGE_LANG[beste.tag - 1]} {BLOECKE.find((b) => b.key === beste.block)!.label.toLowerCase()}</b>
            {' '}– {faktorText(beste.zelle.index)} so gut wie ein typisches Video ({beste.zelle.n} Videos).</span>
          </p>
        ) : besteTageszeit ? (
          <p className="a-satz">
            <Clock /><span>Tageszeit mit den besten Videos: <b>{BLOECKE.find((b) => b.key === besteTageszeit.block)!.label.toLowerCase()}</b>
            {' '}({faktorText(besteTageszeit.index)}, {besteTageszeit.n} Videos). Für einzelne Wochentage reicht es noch nicht.</span>
          </p>
        ) : (
          <p className="a-satz dim"><Clock /><span>Noch zu wenig Videos mit echter Uhrzeit. Ab jetzt zählt jeder Tipp auf „Gepostet“ mit.</span></p>
        )}
        <div className="a-raster" role="table" aria-label="Wochentag und Tageszeit">
          <span />
          {BLOECKE.map((b) => <span key={b.key} className="a-kopf" title={b.label}>{b.kurz}</span>)}
          {TAGE.map((t, i) => (
            <div key={t} style={{ display: 'contents' }}>
              <span className="a-tag">{t}</span>
              {BLOECKE.map((b) => {
                const z = raster[i + 1][b.key]
                const zeigen = z.n >= 2 && z.index != null
                const staerke = zeigen ? Math.min(1, Math.max(0.12, (z.index! / maxIndex))) : 0
                return (
                  <span
                    key={b.key}
                    className={`a-feld ${zeigen ? (staerke > 0.55 ? 'stark' : '') : 'leer'} ${beste && beste.tag === i + 1 && beste.block === b.key ? 'best' : ''}`}
                    style={zeigen ? { ['--s' as string]: staerke } : undefined}
                    title={zeigen ? `${TAGE_LANG[i]} ${b.label}: ${faktorText(z.index)} · ${z.n} Videos` : `${TAGE_LANG[i]} ${b.label}: ${z.n ? z.n + ' Video' : 'keine Videos'}`}
                  >
                    {zeigen ? faktorText(z.index) : z.n === 1 ? '·' : ''}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
        <p className="a-fuss">1,0× = so gut wie ein typisches Video desselben Kunden. Felder ab 2 Videos.</p>
      </div>

      {/* --------------------------------------------------------- Was wirkt */}
      <div className="n-abschnitt"><h2>Was wirkt</h2><span>im Vergleich</span></div>
      <div className="n-gruppe">
        {plattform.faktor != null && plattform.n >= 3 && (
          <div className="n-zeile a-vgl">
            <span className="n-ic tinte"><TrendingUp strokeWidth={2.2} /></span>
            <span className="n-text">
              <span className="n-titel">TikTok vs. Instagram</span>
              <span className="n-unter">dasselbe Video · {plattform.n} Videos</span>
            </span>
            <span className="a-wert">
              {plattform.faktor >= 1
                ? <>TikTok {faktorText(plattform.faktor)}</>
                : <>Instagram {faktorText(1 / plattform.faktor)}</>}
            </span>
          </div>
        )}
        {vgl.map((x) => {
          // Unter 10 % Unterschied ist das eher Rauschen als eine Erkenntnis.
          const art = x.vorteil == null ? 'offen' : Math.abs(x.vorteil) < 10 ? 'gleich' : x.vorteil > 0 ? 'besser' : 'schlechter'
          return (
            <div key={x.key} className="n-zeile a-vgl">
              <span className={`n-ic ${art === 'besser' ? 'gruen' : art === 'schlechter' ? 'rot' : 'grau'}`}>
                <span className="a-pfeil">{art === 'offen' ? '?' : art === 'gleich' ? '=' : art === 'besser' ? '↑' : '↓'}</span>
              </span>
              <span className="n-text">
                <span className="n-titel">{x.titel}</span>
                <span className="n-unter">
                  {x.a.label} {faktorText(x.a.index)} ({x.a.n}) · {x.b.label} {faktorText(x.b.index)} ({x.b.n})
                </span>
              </span>
              <span className={`a-wert ${art === 'besser' ? 'gruen' : art === 'schlechter' ? 'rot' : 'dim'}`}>
                {art === 'offen' ? 'zu wenig' : art === 'gleich' ? 'kein Unterschied' : `${x.vorteil! > 0 ? '+' : ''}${x.vorteil} %`}
              </span>
            </div>
          )
        })}
      </div>
      <p className="p-fuss">Aussagen erst ab 5 Videos je Seite. Caption, Hashtags und Sound füllen sich ab jetzt mit jedem Abruf.</p>

      {/* -------------------------------------------------------- Top-Videos */}
      <div className="n-abschnitt"><h2>Top-Videos</h2></div>
      <div className="n-segment">
        <button className={sortierung === 'index' ? 'on' : ''} onClick={() => setSortierung('index')}>Über Schnitt</button>
        <button className={sortierung === 'views' ? 'on' : ''} onClick={() => setSortierung('views')}>Views</button>
        <button className={sortierung === 'share' ? 'on' : ''} onClick={() => setSortierung('share')}>Geteilt</button>
      </div>
      <div className="n-gruppe">
        {top.length === 0 ? (
          <div className="n-leer">{loading ? 'Lade …' : 'Noch keine Zahlen in diesem Zeitraum.'}</div>
        ) : top.map((v) => (
          <VideoZeile
            key={v.id}
            v={v}
            kunde={kunde ? null : kundeVon.get(v.client_id)?.name ?? null}
            wert={sortierung === 'views' ? kurzZahl(v.views) : sortierung === 'index' ? faktorText(idx.get(v.id) ?? null) : prozentText(v.share_rate_tiktok, 2)}
            unterWert={sortierung === 'index' ? kurzZahl(v.views) + ' Views' : sortierung === 'share' ? kurzZahl(v.views_tiktok) + ' Views' : faktorText(idx.get(v.id) ?? null)}
          />
        ))}
      </div>

      {/* ------------------------------------------------------ Spaetzuender */}
      {spaet.length > 0 && (
        <>
          <div className="n-abschnitt"><h2>Spätzünder</h2><span>wuchsen nach Tag 1 weiter</span></div>
          <div className="n-gruppe">
            {spaet.map(({ video: v, faktor }) => (
              <VideoZeile
                key={v.id} v={v}
                kunde={kunde ? null : kundeVon.get(v.client_id)?.name ?? null}
                wert={faktorText(faktor)}
                unterWert={`${kurzZahl(v.views_tag1)} → ${kurzZahl(v.views_tag28)}`}
              />
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ Sounds */}
      {sound.length > 0 && (
        <>
          <div className="n-abschnitt"><h2>Sounds</h2><span>mehrfach genutzt</span></div>
          <div className="n-gruppe">
            {sound.map((s) => (
              <div key={s.sound} className="n-zeile a-vgl">
                <span className={`n-ic ${s.original ? 'glut' : 'lila'}`}><Music strokeWidth={2.2} /></span>
                <span className="n-text">
                  <span className="n-titel">{s.sound}</span>
                  <span className="n-unter">{s.original ? 'Originalton' : 'Trend-Sound'} · {s.n} Videos</span>
                </span>
                <span className="a-wert">{faktorText(s.index)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ Kunden */}
      {!kunde && (
        <>
          <div className="n-abschnitt"><h2>Kunden</h2></div>
          <div className="n-gruppe">
            {proKunde.length === 0 ? (
              <div className="n-leer">{loading ? 'Lade …' : 'Keine Videos in diesem Zeitraum.'}</div>
            ) : proKunde.map((k) => {
              const f = follower.proKunde.get(k.id)
              const fSumme = f ? (f.ig ?? 0) + (f.tt ?? 0) : 0
              return (
                <button key={k.id} className="n-zeile" onClick={() => setKunde(k.id)}>
                  <LogoFrame name={k.kunde.name} logoUrl={k.kunde.logo_url} className="a-logo" />
                  <span className="n-text">
                    <span className="n-titel">{k.kunde.name}</span>
                    <span className="n-unter">{k.anzahl} {k.anzahl === 1 ? 'Video' : 'Videos'} · Ø {kurzZahl(k.views / k.anzahl)} Views{fSumme ? ` · ${kurzZahl(fSumme)} Follower` : ''}</span>
                  </span>
                  <span className="a-wert">{kurzZahl(k.views)}</span>
                  <ChevronRight className="n-chevron" />
                </button>
              )
            })}
          </div>
        </>
      )}
      {kunde && (
        <div className="n-abschnitt">
          <button className="n-mehr-link" style={{ marginLeft: 0 }} onClick={() => navigate(`/client/${kunde}`)}>
            Zur Kundenakte von {kundeVon.get(kunde)?.name}
          </button>
        </div>
      )}
    </>
  )
}

function VideoZeile({ v, kunde, wert, unterWert }: { v: AnalyseVideo; kunde: string | null; wert: string; unterWert: string }) {
  const link = linkVon(v)
  const inhalt = (
    <>
      {v.cover
        ? <img className="a-cover" src={v.cover} alt="" loading="lazy" />
        : <span className="a-cover leer"><Play strokeWidth={2.2} /></span>}
      <span className="n-text">
        <span className="n-titel">{v.title || 'Video'}</span>
        <span className="n-unter">{[kunde, datumKurz(v.veroeffentlicht), v.tiktok_url && v.instagram_url ? 'TikTok + IG' : v.tiktok_url ? 'TikTok' : v.instagram_url ? 'Instagram' : null].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="a-wert-block">
        <b>{wert}</b>
        <small>{unterWert}</small>
      </span>
    </>
  )
  return link
    ? <a className="n-zeile" href={link} target="_blank" rel="noopener noreferrer">{inhalt}</a>
    : <div className="n-zeile">{inhalt}</div>
}
