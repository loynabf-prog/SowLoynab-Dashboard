// Alles, was die Apify-Abrufe zu einem Posting ohnehin mitliefern -- ausser
// den Zahlen. Bisher weggeworfen, jetzt gespeichert (Migration 0044).
// Kostet nichts extra: dieselbe Antwort, die wir fuer Views/Likes schon holen.
//
// Wird von refresh-stats und fetch-post-links benutzt. Die Feldnamen der
// Actors sind nicht garantiert stabil, deshalb ueberall mehrere Kandidaten
// und im Zweifel null statt einer geratenen Angabe.

export type MetaPatch = Record<string, unknown>

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function zeit(it: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = it?.[k]
    if (typeof v === 'string' && !isNaN(Date.parse(v))) return new Date(v).toISOString()
    if (typeof v === 'number' && v > 1e9) return new Date((v < 1e12 ? v * 1000 : v)).toISOString()
  }
  return null
}

/** Hashtags/Erwaehnungen als saubere Liste ohne #/@, klein, ohne Dubletten. */
function liste(v: unknown, feld?: string): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v
    .map((x) => (typeof x === 'string' ? x : feld ? x?.[feld] : null))
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .map((x) => x.trim().replace(/^[#@]/, '').toLowerCase())
  return out.length ? [...new Set(out)] : []
}

/** Hashtags notfalls aus dem Text lesen. */
function tagsAusText(t: string | null): string[] {
  if (!t) return []
  return [...new Set((t.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.slice(1).toLowerCase()))]
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

export interface MetaErgebnis { patch: MetaPatch; coverQuelle: string | null }

export function tiktokMeta(it: any): MetaErgebnis {
  if (!it) return { patch: {}, coverQuelle: null }
  const caption = text(it.text) ?? text(it.desc)
  const musik = it.musicMeta ?? it.music ?? {}
  const titel = text(musik.musicName) ?? text(musik.title)
  const kuenstler = text(musik.musicAuthor) ?? text(musik.authorName)
  return {
    patch: {
      tiktok_published_at: zeit(it, ['createTimeISO', 'createTime']),
      tiktok_caption: caption,
      tiktok_hashtags: liste(it.hashtags, 'name') ?? tagsAusText(caption),
      tiktok_mentions: liste(it.mentions) ?? liste(it.detailedMentions, 'name'),
      tiktok_sound: titel ? (kuenstler ? `${titel} – ${kuenstler}` : titel) : null,
      tiktok_sound_original: bool(musik.musicOriginal) ?? bool(musik.original),
      tiktok_pinned: bool(it.isPinned),
    },
    coverQuelle: text(it.videoMeta?.coverUrl) ?? text(it.videoMeta?.originalCoverUrl) ?? text(it.covers?.default),
  }
}

export function instagramMeta(it: any): MetaErgebnis {
  if (!it) return { patch: {}, coverQuelle: null }
  const caption = text(it.caption)
  const musik = it.musicInfo ?? {}
  const titel = text(musik.song_name) ?? text(musik.songName)
  const kuenstler = text(musik.artist_name) ?? text(musik.artistName)
  const original = bool(musik.uses_original_audio) ?? bool(musik.usesOriginalAudio)
  const pt = text(it.productType)
  const typ = pt === 'clips' ? 'reel'
    : it.type === 'Sidecar' ? 'karussell'
    : it.type === 'Video' ? 'video'
    : it.type === 'Image' ? 'bild' : null
  const kommentare = Array.isArray(it.latestComments)
    ? it.latestComments
        .map((c: any) => ({ text: text(c?.text), likes: typeof c?.likesCount === 'number' ? c.likesCount : null, zeit: text(c?.timestamp) }))
        .filter((c: any) => c.text)
        .slice(0, 10)
    : null
  return {
    patch: {
      ig_published_at: zeit(it, ['timestamp', 'takenAt']),
      ig_caption: caption,
      ig_hashtags: liste(it.hashtags) ?? tagsAusText(caption),
      ig_mentions: liste(it.mentions),
      ig_sound: titel ? (kuenstler ? `${titel} – ${kuenstler}` : titel) : (original ? 'Originalton' : null),
      ig_sound_original: original,
      ig_type: typ,
      ig_location: text(it.locationName),
      ig_collabs: liste(it.coauthorProducers, 'username'),
      ig_comments_sample: kommentare,
      ig_pinned: bool(it.isPinned),
    },
    coverQuelle: text(it.displayUrl) ?? text(it.thumbnailUrl),
  }
}

/** null-Werte rauswerfen -- ein Feld, das diesmal fehlt, soll nichts loeschen. */
export function ohneLeere(p: MetaPatch): MetaPatch {
  const out: MetaPatch = {}
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined) out[k] = v
  return out
}

/**
 * Vorschaubild einmal in unseren Speicher legen. Die Adressen von TikTok und
 * Instagram laufen nach Stunden ab. Fester Pfad je Video und Plattform, ein
 * erneuter Abruf ersetzt das Bild. Gibt die dauerhafte Adresse zurueck.
 */
export async function coverSichern(supa: any, videoId: string, plattform: 'tiktok' | 'ig', quelle: string | null): Promise<string | null> {
  if (!quelle) return null
  try {
    const r = await fetch(quelle)
    if (!r.ok) return null
    const typ = r.headers.get('content-type') ?? 'image/jpeg'
    if (!typ.startsWith('image/')) return null
    const endung = typ.includes('png') ? 'png' : typ.includes('webp') ? 'webp' : 'jpg'
    const pfad = `${videoId}-${plattform}.${endung}`
    const up = await supa.storage.from('video-covers').upload(pfad, new Uint8Array(await r.arrayBuffer()), { contentType: typ, upsert: true })
    if (up.error) return null
    return supa.storage.from('video-covers').getPublicUrl(pfad).data.publicUrl
  } catch {
    return null
  }
}

/** Account-Stand aus einem TikTok-Posting (authorMeta) -- kommt bei jedem Abruf mit. */
export function tiktokKonto(it: any): { handle: string | null; followers: number | null; following: number | null; posts: number | null; likesGesamt: number | null } | null {
  const a = it?.authorMeta
  if (!a) return null
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null)
  const handle = text(a.name) ?? text(a.uniqueId)
  return { handle: handle ? handle.toLowerCase() : null, followers: n(a.fans), following: n(a.following), posts: n(a.video), likesGesamt: n(a.heart) }
}

/**
 * TikTok-Follower eines Kunden fuer heute in client_stats schreiben: Zeile des
 * Accounts und Gesamtzeile. Nur die TikTok-Spalten, Instagram bleibt
 * unberuehrt. Bei mehreren TikTok-Accounts wird ueber das Handle zugeordnet;
 * die Gesamtzeile ist dann die Summe der heute bekannten Account-Zeilen.
 */
export async function tiktokFollowerSchreiben(supa: any, clientId: string, it: any): Promise<void> {
  const k = tiktokKonto(it)
  if (!k || k.followers == null) return
  const { data: accs } = await supa.from('client_accounts').select('id, handle').eq('client_id', clientId).eq('platform', 'tiktok')
  const liste = (accs ?? []) as { id: string; handle: string }[]
  const acc = liste.length === 1 ? liste[0] : liste.find((a) => a.handle?.toLowerCase() === k.handle)
  const tag = new Date().toISOString().slice(0, 10)
  const patch = { followers_tiktok: k.followers, following_tiktok: k.following, posts_tiktok: k.posts, likes_total_tiktok: k.likesGesamt }

  async function setze(accountId: string | null, p: Record<string, unknown>) {
    let q = supa.from('client_stats').select('id').eq('client_id', clientId).eq('captured_on', tag)
    q = accountId ? q.eq('account_id', accountId) : q.is('account_id', null)
    const { data: da } = await q.maybeSingle()
    if (da) await supa.from('client_stats').update(p).eq('id', da.id)
    else await supa.from('client_stats').insert({ client_id: clientId, captured_on: tag, ...(accountId ? { account_id: accountId } : {}), ...p })
  }

  if (acc) await setze(acc.id, patch)
  if (liste.length <= 1) { await setze(null, patch); return }
  // Mehrere Accounts: Gesamtzeile aus den heutigen Account-Zeilen summieren.
  const { data: heute } = await supa.from('client_stats')
    .select('followers_tiktok, likes_total_tiktok').eq('client_id', clientId).eq('captured_on', tag).not('account_id', 'is', null)
  const s = (heute ?? []) as any[]
  const summe = (f: string) => { const w = s.map((r) => r[f]).filter((x) => typeof x === 'number'); return w.length ? w.reduce((a: number, b: number) => a + b, 0) : null }
  await setze(null, { followers_tiktok: summe('followers_tiktok'), likes_total_tiktok: summe('likes_total_tiktok') })
}
