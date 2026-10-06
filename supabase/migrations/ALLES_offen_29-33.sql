-- =============================================================================
-- ALLES OFFEN 29–33 — Sammel-Skript
-- =============================================================================
-- Fasst 0029 bis 0033 zusammen: im Supabase SQL Editor EINMAL einfügen,
-- "Run" drücken, fertig.
--
-- Gefahrlos: alles mit "if not exists" bzw. "drop ... if exists" — was schon
-- gelaufen ist, wird übersprungen. Ein zweiter Durchlauf schadet nicht.
--
-- Voraussetzung: ALLES_offen_24-27.sql und 0028_client_accounts.sql sind
-- gelaufen.
--
-- Danach ist in der App freigeschaltet:
--   * Kanäle im Kunden (zwei Betriebe unter einem Dach, je eigene Farbe)
--   * Monatsplan mit abweichender Menge je Monat
--   * gedreht / geschnitten / eingeplant auf der Startseite
--   * Termine (Arbeitszeit, Spiel) + Kalender-Abo fürs Handy
--   * Links kommen nach dem Posten automatisch, Caption hängt an der Idee
-- =============================================================================


-- =============================================================================
-- 0029 — Kanäle innerhalb eines Kunden
-- =============================================================================

create table if not exists client_channels (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  name       text not null,               -- z. B. "Schleckofatz"
  -- Farbe fuer den Streifen an der Videokarte. Hex, damit sie direkt im
  -- style-Attribut landen kann.
  color      text not null default '#0071e3',
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_channels_client on client_channels (client_id);

-- Zwei Kanäle gleichen Namens beim selben Kunden ergeben keinen Sinn.
create unique index if not exists idx_client_channels_uniq
  on client_channels (client_id, lower(name));

drop trigger if exists trg_client_channels_updated_at on client_channels;
create trigger trg_client_channels_updated_at
  before update on client_channels
  for each row execute function set_updated_at();

alter table client_channels enable row level security;
drop policy if exists "team_all_client_channels" on client_channels;
create policy "team_all_client_channels" on client_channels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'client_channels'
  ) then
    alter publication supabase_realtime add table client_channels;
  end if;
end$$;

-- =============================================================================
-- Zuordnung
-- =============================================================================
-- Ueberall "on delete set null": wird ein Kanal geloescht, verlieren die
-- Videos nur ihre Zuordnung. Sie selbst bleiben unangetastet.

alter table client_accounts add column if not exists channel_id uuid
  references client_channels (id) on delete set null;
alter table videos          add column if not exists channel_id uuid
  references client_channels (id) on delete set null;
alter table video_ideas     add column if not exists channel_id uuid
  references client_channels (id) on delete set null;

create index if not exists idx_client_accounts_channel on client_accounts (channel_id);
create index if not exists idx_videos_channel          on videos (channel_id);
create index if not exists idx_video_ideas_channel     on video_ideas (channel_id);

-- =============================================================================
-- Vorhandene Account-Namen zu Kanälen machen
-- =============================================================================
-- Wer bei seinen Accounts schon Klarnamen vergeben hat ("Schleckofatz",
-- "Schmackofatz"), bekommt daraus direkt seine Kanäle -- inklusive
-- Zuordnung der Accounts. Nichts abzutippen.
--
-- Farben aus einer festen Reihe, damit sich zwei Kanäle desselben Kunden
-- nicht zufaellig gleichen. Nachtraeglich in der App aenderbar.
insert into client_channels (client_id, name, color, sort)
select
  x.client_id,
  x.label,
  (array['#0071e3', '#e0521a', '#34c759', '#af52de', '#ff9500', '#5ac8fa'])[
    ((x.rn - 1) % 6) + 1
  ],
  x.rn - 1
from (
  select
    client_id,
    trim(label) as label,
    row_number() over (partition by client_id order by min(sort), min(created_at)) as rn
  from client_accounts
  where label is not null and trim(label) <> ''
  group by client_id, trim(label)
) x
on conflict do nothing;

-- Accounts ihrem Kanal zuordnen (ueber den gleichlautenden Namen).
update client_accounts a
   set channel_id = k.id
  from client_channels k
 where k.client_id = a.client_id
   and lower(trim(a.label)) = lower(k.name)
   and a.channel_id is null;

-- =============================================================================
-- Vorhandene Videos zuordnen, wo es eindeutig ist
-- =============================================================================
-- Ein Video, dessen Posting-Link das Handle eines Accounts enthaelt, gehoert
-- zu dessen Kanal. Das trifft nicht jedes Video -- der Rest bleibt ohne
-- Zuordnung und wird in der App von Hand gesetzt. Lieber nichts zuordnen
-- als falsch zuordnen.
update videos v
   set channel_id = a.channel_id
  from client_accounts a
 where a.client_id = v.client_id
   and a.channel_id is not null
   and v.channel_id is null
   and (
     (a.platform = 'tiktok'    and v.tiktok_url    ilike '%@' || a.handle || '/%')
     or (a.platform = 'instagram' and v.instagram_url ilike '%/' || a.handle || '/%')
   );


-- =============================================================================
-- 0030 — Videomenge je Monat
-- =============================================================================

create table if not exists client_month_plans (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  month_key  text not null,               -- "2026-10"
  quota      integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_month_plans_client on client_month_plans (client_id);

-- Eine Ausnahme je Kunde und Monat -- sonst waere unklar, welche gilt.
create unique index if not exists idx_month_plans_uniq
  on client_month_plans (client_id, month_key);

drop trigger if exists trg_month_plans_updated_at on client_month_plans;
create trigger trg_month_plans_updated_at
  before update on client_month_plans
  for each row execute function set_updated_at();

alter table client_month_plans enable row level security;
drop policy if exists "team_all_month_plans" on client_month_plans;
create policy "team_all_month_plans" on client_month_plans
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'client_month_plans'
  ) then
    alter publication supabase_realtime add table client_month_plans;
  end if;
end$$;


-- =============================================================================
-- 0031 — Vorarbeit: gedreht, geschnitten, eingeplant
-- =============================================================================

alter table videos add column if not exists prep_shot      boolean not null default false;
alter table videos add column if not exists prep_edited    boolean not null default false;
alter table videos add column if not exists prep_scheduled boolean not null default false;

-- Was schon gepostet ist, war zwangslaeufig gedreht, geschnitten und
-- eingeplant. Einmal nachtragen, damit alte Videos nicht als unfertig
-- dastehen.
update videos
   set prep_shot = true, prep_edited = true, prep_scheduled = true
 where status = 'posted'
   and (prep_shot = false or prep_edited = false or prep_scheduled = false);


-- =============================================================================
-- 0032 — Termine + Kalender-Abo fürs Handy
-- =============================================================================

create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  -- 'arbeit' (Arbeitszeit) | 'spiel' (Spielplan) | 'termin' (alles andere)
  kind       text not null default 'termin',
  starts_on  date not null,
  ends_on    date,                          -- leer = eintaegig
  starts_at  time,                          -- leer = ganztaegig
  ends_at    time,
  -- Leer heisst "gilt fuer alle". Das ist der haeufigere Fall und soll
  -- deshalb der sein, fuer den man nichts tun muss.
  member_ids uuid[] not null default '{}',
  notes      text,
  deleted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_datum on events (starts_on) where deleted_at is null;

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
  before update on events
  for each row execute function set_updated_at();

alter table events enable row level security;
drop policy if exists "team_all_events" on events;
create policy "team_all_events" on events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
end$$;

-- =============================================================================
-- Abo-Schluessel je Teammitglied
-- =============================================================================
alter table team_members add column if not exists calendar_token uuid;

-- Vorhandene Mitglieder bekommen einen. Nur die ohne -- ein zweiter Lauf
-- darf keine neuen Schluessel vergeben, sonst sind alle Abos tot.
update team_members set calendar_token = gen_random_uuid() where calendar_token is null;

alter table team_members alter column calendar_token set default gen_random_uuid();

create unique index if not exists idx_team_members_cal_token
  on team_members (calendar_token);


-- =============================================================================
-- 0033 — Links automatisch holen + Caption an der Idee
-- =============================================================================

-- Wann darf der Hintergrundlauf es versuchen? Leer = gar nicht.
alter table videos add column if not exists link_fetch_at    timestamptz;
-- null | 'offen' | 'fertig' | 'unklar' | 'fehlgeschlagen'
alter table videos add column if not exists link_fetch_state text;
alter table videos add column if not exists link_fetch_note  text;
-- Begrenzt die Versuche. Ein dauerhaft privates Profil soll nicht ewig
-- Apify-Guthaben verbrennen.
alter table videos add column if not exists link_fetch_tries integer not null default 0;

-- Der Hintergrundlauf sucht genau danach: faellige, noch offene Abrufe.
create index if not exists idx_videos_link_fetch
  on videos (link_fetch_at)
  where link_fetch_at is not null and deleted_at is null;

alter table video_ideas add column if not exists caption text;
