-- 0044: Alles speichern, was die Abrufe ohnehin mitliefern
-- =============================================================================
-- refresh-stats und fetch-post-links bekommen von Apify pro Posting nicht nur
-- Zahlen, sondern auch Uhrzeit, Caption, Hashtags, Sound, Vorschaubild usw.
-- Bisher weggeworfen. Ab jetzt landet es hier -- ohne einen einzigen
-- zusaetzlichen Abruf. Rein additiv, darf mehrfach laufen.
--
-- Fuer die Analyse gibt es dazu die Sicht video_analyse mit fertig
-- berechneten Kennzahlen (Engagement-Rate, Share-Rate, Views pro Follower,
-- Wachstum Tag 1/7/28, Uhrzeit/Wochentag in Berliner Zeit).

-- ---------------------------------------------------------------- videos
alter table videos
  add column if not exists tiktok_published_at  timestamptz,
  add column if not exists tiktok_caption       text,
  add column if not exists tiktok_hashtags      text[],
  add column if not exists tiktok_mentions      text[],
  add column if not exists tiktok_sound         text,
  add column if not exists tiktok_sound_original boolean,
  add column if not exists tiktok_pinned        boolean,
  add column if not exists tiktok_cover         text,
  add column if not exists ig_published_at      timestamptz,
  add column if not exists ig_caption           text,
  add column if not exists ig_hashtags          text[],
  add column if not exists ig_mentions          text[],
  add column if not exists ig_sound             text,
  add column if not exists ig_sound_original    boolean,
  add column if not exists ig_type              text,      -- reel | karussell | video | bild
  add column if not exists ig_location          text,
  add column if not exists ig_collabs           text[],
  add column if not exists ig_comments_sample   jsonb,     -- [{text, likes, zeit}] bis zu 10
  add column if not exists ig_pinned            boolean,
  add column if not exists ig_cover             text,
  add column if not exists meta_updated_at      timestamptz;

-- ---------------------------------------------------------- client_stats
-- TikTok liefert mit jedem Abruf auch die Gesamt-Likes des Accounts.
alter table client_stats add column if not exists likes_total_tiktok bigint;

-- ------------------------------------------------------- client_accounts
-- Der monatliche Profil-Abruf liefert Bio, Kategorie, Link, Haken.
alter table client_accounts
  add column if not exists bio                text,
  add column if not exists kategorie          text,
  add column if not exists external_url       text,
  add column if not exists verifiziert        boolean,
  add column if not exists profil_updated_at  timestamptz;

-- ------------------------------------------------------ Vorschaubilder
insert into storage.buckets (id, name, public)
values ('video-covers', 'video-covers', true)
on conflict (id) do nothing;

-- ------------------------------------------------------- Analyse-Sicht
-- security_invoker: die Sicht sieht nur, was der Aufrufer per RLS sehen darf.
create or replace view video_analyse with (security_invoker = true) as
with basis as (
  select
    v.*,
    coalesce(v.tiktok_published_at, v.ig_published_at, v.posted_at) as veroeffentlicht
  from videos v
  where v.deleted_at is null and v.status = 'posted'
)
select
  b.id, b.client_id, b.title, b.category, b.pillar_id, b.series_id, b.posted_at,
  b.veroeffentlicht,
  extract(isodow from b.veroeffentlicht at time zone 'Europe/Berlin')::int as wochentag,  -- 1 = Mo
  extract(hour   from b.veroeffentlicht at time zone 'Europe/Berlin')::int as stunde,
  b.duration_seconds,

  -- Zahlen
  b.views, b.likes, b.comments, b.shares, b.saves,
  b.views_tiktok, b.likes_tiktok, b.comments_tiktok, b.shares_tiktok, b.saves_tiktok,
  b.views_ig, b.likes_ig, b.comments_ig,

  -- Quoten (0..1). Instagram hat oeffentlich keine Shares/Saves.
  round((coalesce(b.likes_tiktok,0) + coalesce(b.comments_tiktok,0) + coalesce(b.shares_tiktok,0) + coalesce(b.saves_tiktok,0))::numeric
        / nullif(b.views_tiktok, 0), 4) as engagement_rate_tiktok,
  round((coalesce(b.likes_ig,0) + coalesce(b.comments_ig,0))::numeric / nullif(b.views_ig, 0), 4) as engagement_rate_ig,
  round(b.shares_tiktok::numeric / nullif(b.views_tiktok, 0), 4) as share_rate_tiktok,
  round(b.saves_tiktok::numeric  / nullif(b.views_tiktok, 0), 4) as save_rate_tiktok,
  round(b.comments_tiktok::numeric / nullif(b.views_tiktok, 0), 4) as comment_rate_tiktok,

  -- Follower zum Zeitpunkt des Postings (letzter Stand davor) und Views je Follower
  f.followers_tiktok as follower_tiktok_beim_post,
  f.followers_ig     as follower_ig_beim_post,
  round(b.views_tiktok::numeric / nullif(f.followers_tiktok, 0), 3) as views_pro_follower_tiktok,
  round(b.views_ig::numeric     / nullif(f.followers_ig, 0), 3)     as views_pro_follower_ig,

  -- Wachstum: Views am ersten Schnappschuss ab Tag 1 / 7 / 28 (max. 3 Tage spaeter)
  w1.views  as views_tag1,
  w7.views  as views_tag7,
  w28.views as views_tag28,

  -- Inhalt
  coalesce(b.tiktok_caption, b.ig_caption) as caption_live,
  length(coalesce(b.tiktok_caption, b.ig_caption)) as caption_laenge,
  coalesce(b.tiktok_caption, b.ig_caption) ~ '\?' as caption_frage,
  coalesce(cardinality(b.tiktok_hashtags), cardinality(b.ig_hashtags)) as hashtag_anzahl,
  b.tiktok_hashtags, b.ig_hashtags, b.tiktok_mentions, b.ig_mentions,
  b.tiktok_sound, b.tiktok_sound_original, b.ig_sound, b.ig_sound_original,
  b.ig_type, b.ig_location, b.ig_collabs, b.ig_comments_sample,
  b.tiktok_pinned, b.ig_pinned,
  coalesce(b.tiktok_cover, b.ig_cover) as cover,
  b.tiktok_cover, b.ig_cover,
  b.tiktok_url, b.instagram_url,
  b.stats_updated_at, b.meta_updated_at,
  -- Echte Uhrzeit? Plattform-Zeit oder ein Tipp auf "Gepostet". Alte, von Hand
  -- nachgetragene Videos stehen auf voller Stunde (Platzhalter) -- die
  -- verfaelschen sonst die "beste Zeit".
  (b.tiktok_published_at is not null or b.ig_published_at is not null
    or date_trunc('hour', b.posted_at) <> b.posted_at) as zeit_echt
from basis b
left join lateral (
  select
    (select s.followers_tiktok from client_stats s
      where s.client_id = b.client_id and s.account_id is null and s.followers_tiktok is not null
        and s.captured_on <= (b.veroeffentlicht at time zone 'Europe/Berlin')::date
      order by s.captured_on desc limit 1) as followers_tiktok,
    (select s.followers_ig from client_stats s
      where s.client_id = b.client_id and s.account_id is null and s.followers_ig is not null
        and s.captured_on <= (b.veroeffentlicht at time zone 'Europe/Berlin')::date
      order by s.captured_on desc limit 1) as followers_ig
) f on true
left join lateral (
  select vs.views from video_stats vs
   where vs.video_id = b.id
     and vs.captured_on between (b.veroeffentlicht::date + 1) and (b.veroeffentlicht::date + 4)
   order by vs.captured_on limit 1
) w1 on true
left join lateral (
  select vs.views from video_stats vs
   where vs.video_id = b.id
     and vs.captured_on between (b.veroeffentlicht::date + 7) and (b.veroeffentlicht::date + 10)
   order by vs.captured_on limit 1
) w7 on true
left join lateral (
  select vs.views from video_stats vs
   where vs.video_id = b.id
     and vs.captured_on between (b.veroeffentlicht::date + 28) and (b.veroeffentlicht::date + 31)
   order by vs.captured_on limit 1
) w28 on true;

grant select on video_analyse to authenticated;
revoke all on video_analyse from anon;
