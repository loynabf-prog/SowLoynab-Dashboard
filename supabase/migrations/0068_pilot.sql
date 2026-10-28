-- 0068: Der Pilot -- die Zahlen, aus denen das CRM selbst entscheidet.
-- ---------------------------------------------------------------------------
-- Eine Sicht je aktivem Kunden mit allem, was der Pilot (src/lib/pilot.ts
-- und die Edge Function pilot-push) braucht, um zu sagen, was als Naechstes
-- dran ist: Monatsziel und Stand, die Pizza-Stufen (Teig, Belegt, Ofen,
-- Raus, Teller), fehlende Links, alte Zahlen, der naechste Drehtag und der
-- Vormonat. App und Push lesen DIESELBE Sicht -- so sagt der Morgen-Push
-- nie etwas anderes als die Startseite.
--
-- "Heute" und "dieser Monat" sind deutsche Zeit.

create or replace view pilot_kunden as
with heute as (
  select (now() at time zone 'Europe/Berlin')::date as tag,
         to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM') as monat,
         to_char((now() at time zone 'Europe/Berlin') - interval '1 month', 'YYYY-MM') as vormonat,
         to_char((now() at time zone 'Europe/Berlin') + interval '1 month', 'YYYY-MM') as naechster
),
auftr as (
  -- Offene/laufende Auftraege = Zettel bzw. im Ofen; erledigte ohne Servieren
  -- zeigt produktion_stufe am Video (pruefung/feinschliff = Raus).
  select video_id,
         bool_or(status = 'laeuft') as laeuft,
         bool_or(status = 'offen') as offen
  from video_aenderungen
  where deleted_at is null and status in ('offen', 'laeuft')
  group by video_id
),
vid as (
  select v.*, h.tag, h.monat,
         coalesce(a.laeuft, false) as im_ofen,
         coalesce(a.offen, false) as zettel,
         -- Ein Video zaehlt zu genau einem Monat (wie lib/monatsplan.ts)
         coalesce(v.abrechnungsmonat,
                  left(v.scheduled_date::text, 7),
                  to_char(v.posted_at at time zone 'Europe/Berlin', 'YYYY-MM')) as zaehl_monat
  from videos v
  cross join heute h
  left join auftr a on a.video_id = v.id
  where v.deleted_at is null
),
je_kunde as (
  select client_id,
    count(*) filter (where status = 'posted' and zaehl_monat = monat) as gepostet_monat,
    count(*) filter (where status <> 'posted' and zaehl_monat = monat) as offen_monat,
    count(*) filter (where status = 'posted' and posted_at >= now() - interval '7 days') as gepostet_7t,
    -- Teller: fertig; mit oder ohne Posting-Tag
    count(*) filter (where status in ('ready', 'planned') and scheduled_date is not null and scheduled_date >= tag) as eingeplant,
    count(*) filter (where status in ('ready', 'planned') and (scheduled_date is null or scheduled_date < tag)) as fertig_ohne_termin,
    count(*) filter (where status = 'todo' and produktion_stufe = 'fertig') as fertig_todo,
    count(*) filter (where status <> 'posted' and im_ofen) as im_ofen,
    count(*) filter (where status <> 'posted' and zettel and not im_ofen) as zettel,
    count(*) filter (where status <> 'posted' and not im_ofen and not zettel and produktion_stufe in ('pruefung', 'feinschliff')) as raus,
    count(*) filter (where status = 'todo' and not im_ofen and not zettel
                     and coalesce(produktion_stufe, '') not in ('pruefung', 'feinschliff', 'fertig')
                     and (prep_shot or produktion_stufe = 'roh')) as belegt,
    count(*) filter (where status = 'todo' and not im_ofen and not zettel
                     and coalesce(produktion_stufe, '') not in ('pruefung', 'feinschliff', 'fertig', 'roh')
                     and not coalesce(prep_shot, false)) as teig,
    count(*) filter (where status = 'posted' and posted_at < now() - interval '1 day' and posted_at >= now() - interval '60 days'
                     and (coalesce(tiktok_url, '') = '' or coalesce(instagram_url, '') = '')) as links_fehlen,
    count(*) filter (where status = 'posted' and posted_at >= now() - interval '60 days'
                     and (stats_updated_at is null or stats_updated_at < now() - interval '7 days')) as zahlen_alt,
    max(posted_at) as zuletzt_gepostet
  from vid
  group by client_id
),
ideen as (
  select client_id, count(*) as ideen
  from video_ideas where deleted_at is null and moved_video_id is null
  group by client_id
),
dreh as (
  select e.client_id,
         min(e.starts_on) as naechster_drehtag,
         sum(coalesce(e.planned_videos, 0)) as drehtag_videos
  from events e cross join heute h
  where e.deleted_at is null and e.kind = 'dreh' and e.starts_on >= h.tag
  group by e.client_id
),
plan_monat as (
  select p.client_id, p.quota, p.dabei
  from client_month_plans p cross join heute h
  where p.month_key = h.monat
),
plan_naechster as (
  select p.client_id, p.quota, p.dabei
  from client_month_plans p cross join heute h
  where p.month_key = h.naechster
),
plan_vormonat as (
  select p.client_id, p.status as vormonat_status, p.zahlstatus as vormonat_zahlstatus, p.quota as vormonat_quota
  from client_month_plans p cross join heute h
  where p.month_key = h.vormonat
)
select
  c.id as client_id,
  c.name,
  c.logo_url,
  c.client_type,
  c.zustaendig_id,
  c.pausiert_seit,
  c.pause_grund,
  c.contract_end,
  h.tag as heute,
  h.monat,
  -- Ziel: Monatsplan schlaegt Retainer; "nicht dabei" = 0
  case when pm.client_id is not null then (case when coalesce(pm.dabei, true) then pm.quota else 0 end)
       else coalesce(c.monthly_quota, 0) end as ziel,
  coalesce(k.gepostet_monat, 0) as gepostet,
  coalesce(k.offen_monat, 0) as offen_monat,
  coalesce(k.gepostet_7t, 0) as gepostet_7t,
  coalesce(k.eingeplant, 0) as eingeplant,
  coalesce(k.fertig_ohne_termin, 0) + coalesce(k.fertig_todo, 0) as fertig_ohne_termin,
  coalesce(k.im_ofen, 0) as im_ofen,
  coalesce(k.zettel, 0) as zettel,
  coalesce(k.raus, 0) as raus,
  coalesce(k.belegt, 0) as belegt,
  coalesce(k.teig, 0) as teig,
  coalesce(i.ideen, 0) as ideen,
  coalesce(k.links_fehlen, 0) as links_fehlen,
  coalesce(k.zahlen_alt, 0) as zahlen_alt,
  k.zuletzt_gepostet,
  d.naechster_drehtag,
  coalesce(d.drehtag_videos, 0) as drehtag_videos,
  pv.vormonat_status,
  pv.vormonat_zahlstatus,
  pv.vormonat_quota,
  -- Ziel des naechsten Monats: der Pilot schaut einen Monat voraus (neue Spalten nur hinten anhaengen)
  case when pn.client_id is not null then (case when coalesce(pn.dabei, true) then pn.quota else 0 end)
       else coalesce(c.monthly_quota, 0) end as ziel_naechster
from clients c
cross join heute h
left join je_kunde k on k.client_id = c.id
left join ideen i on i.client_id = c.id
left join dreh d on d.client_id = c.id
left join plan_monat pm on pm.client_id = c.id
left join plan_naechster pn on pn.client_id = c.id
left join plan_vormonat pv on pv.client_id = c.id
where c.deleted_at is null and c.active;

comment on view pilot_kunden is 'Pilot (0068): je aktivem Kunden Monatsziel, Stand und Pizza-Stufen -- Grundlage fuer Empfehlungen in App und Morgen-Push.';

grant select on pilot_kunden to anon, authenticated, service_role;

-- Cron (bereits eingerichtet, hier nur dokumentiert): "pilot-push" taeglich
-- 06:40 UTC = 07:40 deutscher Zeit (Winter), eine halbe Stunde nach den
-- daily-reminders. Ruft die Edge Function pilot-push mit dem anon key.
--   select cron.schedule('pilot-push', '40 6 * * *', $$ select net.http_post(
--     url := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/pilot-push',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon>'),
--     body := '{}'::jsonb); $$);
