-- 0057: Verlauf pro Plattform + Follower woechentlich
-- ---------------------------------------------------------------------------
-- video_stats hat bisher nur TikTok+Instagram zusammengezaehlt gespeichert.
-- Damit war im Verlauf nicht mehr zu sehen, welche Plattform wann gewachsen
-- ist. Ab jetzt schreibt jeder Abruf die Zahlen auch getrennt mit.
-- (Instagram gibt Shares/Saves oeffentlich nicht her -> nur TikTok.)

alter table public.video_stats
  add column if not exists views_tiktok    integer,
  add column if not exists likes_tiktok    integer,
  add column if not exists comments_tiktok integer,
  add column if not exists shares_tiktok   integer,
  add column if not exists saves_tiktok    integer,
  add column if not exists views_ig        integer,
  add column if not exists likes_ig        integer,
  add column if not exists comments_ig     integer;

-- Follower (v. a. Instagram) jeden Montag statt nur am 1. des Monats.
-- TikTok-Follower kommen weiterhin zusaetzlich gratis bei jedem Video-Abruf.
select cron.alter_job(jobid, schedule := '45 5 * * 1')
from cron.job where jobname = 'refresh-account-stats';

-- Flache Tabelle fuer Auswertungen/Export: ein Messpunkt pro Video und Tag,
-- mit Kunde, Veroeffentlichung und Alter des Videos am Messtag.
create or replace view public.analyse_verlauf
with (security_invoker = true) as
select
  vs.video_id,
  v.client_id,
  c.name                                   as kunde,
  v.title,
  coalesce(v.tiktok_published_at, v.ig_published_at, v.posted_at) as veroeffentlicht,
  vs.captured_on                           as messtag,
  vs.captured_on - (coalesce(v.tiktok_published_at, v.ig_published_at, v.posted_at) at time zone 'Europe/Berlin')::date as alter_tage,
  vs.views, vs.likes, vs.comments, vs.shares, vs.saves,
  vs.views_tiktok, vs.likes_tiktok, vs.comments_tiktok, vs.shares_tiktok, vs.saves_tiktok,
  vs.views_ig, vs.likes_ig, vs.comments_ig
from public.video_stats vs
join public.videos v  on v.id = vs.video_id and v.deleted_at is null
join public.clients c on c.id = v.client_id;

grant select on public.analyse_verlauf to authenticated;
