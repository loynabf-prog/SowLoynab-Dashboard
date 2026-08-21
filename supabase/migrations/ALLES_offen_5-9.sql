-- =============================================================================
-- SAMMEL-SKRIPT: alle offenen Migrationen 0005 bis 0009 in EINER Datei.
-- Einmal komplett kopieren, in Supabase -> SQL Editor einfuegen, EINMAL 'Run'.
-- Gefahrlos: alles mit 'IF NOT EXISTS' -> mehrfaches Ausfuehren schadet nicht.
-- =============================================================================


-- ####################################################################
-- ##  0005_dragdrop_team.sql
-- ####################################################################

-- =============================================================================
-- 0005 — Drag&Drop-Sortierung, Team-Mitglieder, Zuständigkeit, Papierkorb
-- =============================================================================
-- Im Supabase SQL Editor einfuegen und "Run". Reihenfolge nach 0004.
-- =============================================================================

-- --- Team-Mitglieder (selbst pflegbar) --------------------------------------
create table if not exists team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#e0521a',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Fassie & Lion vorbelegen (nur wenn Tabelle leer)
insert into team_members (name, color)
select v.name, v.color
from (values ('Fassie', '#e0521a'), ('Lion', '#2563eb')) as v(name, color)
where not exists (select 1 from team_members);

-- --- Sortier-Reihenfolge fuer Drag & Drop -----------------------------------
alter table videos add column if not exists sort_order double precision;
alter table leads  add column if not exists sort_order double precision;

-- Bestehende Zeilen sinnvoll vorbelegen (nach Erstellzeit)
update videos set sort_order = extract(epoch from created_at) where sort_order is null;
update leads  set sort_order = extract(epoch from created_at) where sort_order is null;

-- --- Zuständigkeit (mehrere moeglich -> "beide") ----------------------------
alter table videos add column if not exists assignee_ids uuid[] not null default '{}';
alter table leads  add column if not exists assignee_ids uuid[] not null default '{}';
alter table tasks  add column if not exists assignee_ids uuid[] not null default '{}';

-- --- Papierkorb (soft delete) — schon anlegen fuer Runde 2 ------------------
alter table clients add column if not exists deleted_at timestamptz;
alter table videos  add column if not exists deleted_at timestamptz;
alter table leads   add column if not exists deleted_at timestamptz;
alter table tasks   add column if not exists deleted_at timestamptz;

-- --- RLS + Realtime fuer team_members ---------------------------------------
alter table team_members enable row level security;
drop policy if exists "team_all_team_members" on team_members;
create policy "team_all_team_members" on team_members
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table team_members;
  end if;
end$$;


-- ####################################################################
-- ##  0006_future.sql
-- ####################################################################

-- =============================================================================
-- 0006 — Zukunfts-Fundament: Analytics, Rechnungen, Kontakte, Erinnerungen,
--        Benachrichtigungen, Dateien, Tags, Einstellungen
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0005.
-- Legt nur DB-Struktur an (schadet nichts, auch wenn Features erst spaeter
-- im Frontend kommen). RLS wie gehabt: nur eingeloggtes Team.
-- =============================================================================

-- --- Kunden: Kontaktdaten, Laufzeit, Tags, Gesundheit ----------------------
alter table clients add column if not exists contact_person text;
alter table clients add column if not exists phone          text;
alter table clients add column if not exists email          text;
alter table clients add column if not exists website        text;
alter table clients add column if not exists city           text;
alter table clients add column if not exists start_date     date;
alter table clients add column if not exists end_date       date;
alter table clients add column if not exists health         text;          -- gut | mittel | kritisch
alter table clients add column if not exists tags           text[] not null default '{}';

-- --- Leads: Herkunft + Tags --------------------------------------------------
alter table leads add column if not exists source text;                    -- Instagram | Empfehlung | Kaltakquise | Website ...
alter table leads add column if not exists tags   text[] not null default '{}';

-- --- Videos: Analytics-Kennzahlen, weitere Plattformen, Tags ----------------
alter table videos add column if not exists posted_at        timestamptz;
alter table videos add column if not exists posted_youtube   boolean not null default false;
alter table videos add column if not exists posted_facebook  boolean not null default false;
alter table videos add column if not exists views     integer;
alter table videos add column if not exists likes     integer;
alter table videos add column if not exists comments  integer;
alter table videos add column if not exists saves     integer;
alter table videos add column if not exists shares    integer;
alter table videos add column if not exists reach     integer;
alter table videos add column if not exists tags      text[] not null default '{}';

-- =============================================================================
-- Analytics-Verlauf: Kennzahlen ueber Zeit (fuer Wachstums-Charts)
-- =============================================================================
create table if not exists video_stats (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos (id) on delete cascade,
  captured_on date not null default current_date,
  views integer, likes integer, comments integer, saves integer, shares integer, reach integer,
  created_at  timestamptz not null default now()
);
create index if not exists idx_video_stats_video on video_stats (video_id);

-- =============================================================================
-- Kontakte: mehrere Ansprechpartner pro Kunde/Lead
-- =============================================================================
create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients (id) on delete cascade,
  lead_id    uuid references leads (id) on delete cascade,
  name       text not null,
  role       text,
  phone      text,
  email      text,
  notes      text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Rechnungen / Zahlungen
-- =============================================================================
create table if not exists invoices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients (id) on delete set null,
  number     text,
  amount     numeric(10,2) not null,
  status     text not null default 'draft',   -- draft | sent | paid | overdue
  issued_on  date not null default current_date,
  due_date   date,
  paid_on    date,
  notes      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoices_client on invoices (client_id);
create index if not exists idx_invoices_status on invoices (status);

-- =============================================================================
-- Erinnerungen (fuer spaeteres echtes Reminder-System)
-- =============================================================================
create table if not exists reminders (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  remind_at   timestamptz not null,
  entity_type text,                            -- video | lead | client | task
  entity_id   uuid,
  channel     text not null default 'app',     -- app | email | push
  done        boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_reminders_at on reminders (remind_at);

-- =============================================================================
-- In-App-Benachrichtigungen (Glocke)
-- =============================================================================
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  body       text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications (user_id, read);

-- =============================================================================
-- Datei-Anhaenge (z. B. Vertraege) pro Kunde
-- =============================================================================
create table if not exists attachments (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients (id) on delete cascade,
  name       text not null,
  url        text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Agentur-Einstellungen (Monatsziel etc.) — eine Zeile, flexibel via jsonb
-- =============================================================================
create table if not exists app_settings (
  id         integer primary key default 1,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint app_settings_single check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- =============================================================================
-- RLS + Realtime fuer alle neuen Tabellen (nur eingeloggtes Team)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'video_stats', 'contacts', 'invoices', 'reminders',
    'notifications', 'attachments', 'app_settings'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team_all_%1$s" on %1$I', t);
    execute format(
      'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;


-- ####################################################################
-- ##  0007_pro.sql
-- ####################################################################

-- =============================================================================
-- 0007 — Pro-Fundament: Wachstums-Tracking, Kundenfreigabe, Content-Serien &
--        Quote, Zeiterfassung/Rendite, Brand-Kit, Automatisierungen
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0006.
-- Nur DB-Struktur (schadet nichts, Features kommen spaeter im Frontend).
-- RLS wie gehabt: nur eingeloggtes Team.
-- =============================================================================

-- --- Kunden: Monatsquote, Brand-Kit, Wachstumsziele ------------------------
alter table clients add column if not exists monthly_quota          integer;   -- geplante Videos/Monat
alter table clients add column if not exists brand_color            text;      -- Markenfarbe (#hex)
alter table clients add column if not exists brand_notes            text;      -- Stil / Do's & Don'ts
alter table clients add column if not exists drive_url              text;      -- Rohmaterial-Ordner
alter table clients add column if not exists goal_followers_ig      integer;   -- Zielwert IG
alter table clients add column if not exists goal_followers_tiktok  integer;   -- Zielwert TikTok

-- --- Videos: Kundenfreigabe --------------------------------------------------
alter table videos add column if not exists approval_status text not null default 'none'; -- none|pending|approved|changes
alter table videos add column if not exists approval_note   text;
alter table videos add column if not exists approved_at     timestamptz;
alter table videos add column if not exists share_token     uuid not null default gen_random_uuid();

-- =============================================================================
-- Content-Serien / Pillars (wiederkehrende Formate)
-- =============================================================================
create table if not exists content_pillars (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients (id) on delete cascade,
  name       text not null,
  color      text not null default '#e0521a',
  cadence    text,                          -- z. B. woechentlich
  weekday    integer,                       -- 0=Mo ... 6=So (optional)
  created_at timestamptz not null default now()
);
alter table videos add column if not exists pillar_id uuid references content_pillars (id) on delete set null;

-- =============================================================================
-- Follower-/Wachstums-Verlauf pro Kunde (ROI-Charts)
-- =============================================================================
create table if not exists client_stats (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  captured_on      date not null default current_date,
  followers_ig     integer,
  followers_tiktok integer,
  reach            integer,
  created_at       timestamptz not null default now()
);
create index if not exists idx_client_stats_client on client_stats (client_id);

-- =============================================================================
-- Zeiterfassung (Aufwand -> Rendite pro Kunde)
-- =============================================================================
create table if not exists time_entries (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  minutes    integer not null,
  note       text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_client on time_entries (client_id);

-- =============================================================================
-- Brand-Assets pro Kunde (Logos, Vorlagen, Links)
-- =============================================================================
create table if not exists client_assets (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  name       text not null,
  url        text,
  kind       text,                          -- logo | font | template | link ...
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Automatisierungen (Regeln fuer spaeter: "wenn X, dann Y")
-- =============================================================================
create table if not exists automations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  trigger    text not null,                 -- z. B. lead_stalled | video_due
  config     jsonb not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- RLS + Realtime fuer alle neuen Tabellen (nur eingeloggtes Team)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'content_pillars', 'client_stats', 'time_entries', 'client_assets', 'automations'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team_all_%1$s" on %1$I', t);
    execute format(
      'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;


-- ####################################################################
-- ##  0008_ideas.sql
-- ####################################################################

-- =============================================================================
-- 0008 — Ideenspeicher (Ideen-Pool) + KI-Briefing pro Kunde
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0007.
--
-- Zwei Bereiche pro Kunde:
--   1. Board (Tabelle "videos") = Ideen, die WIRKLICH umgesetzt werden.
--   2. Ideenspeicher (diese neue Tabelle "video_ideas") = Roh-Ideen-Vorrat.
--      Eine Idee von hier laesst sich mit einem Klick ins Board "ruebernehmen".
--
-- Ausserdem: ein KI-Briefing-Feld am Kunden, aus dem die KI automatisch
-- passende Videoideen erzeugt (per Sprache: "Gib mir 5 Videoideen fuer Sahin").
-- =============================================================================

-- --- KI-Briefing / Randbedingungen pro Kunde --------------------------------
-- Freitext: was verkauft der Betrieb, aktuelle Angebote, Zielgruppe, Tonalitaet,
-- Besonderheiten. Die KI nutzt das als Kontext fuer Ideen-Vorschlaege.
alter table clients add column if not exists ai_brief text;

-- --- Ideenspeicher -----------------------------------------------------------
create table if not exists video_ideas (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients (id) on delete cascade,
  title          text not null,
  notes          text,
  source         text not null default 'manual',  -- manual | ai
  sort_order     double precision,
  moved_video_id uuid references videos (id) on delete set null, -- gesetzt, sobald ins Board uebernommen
  deleted_at     timestamptz,                      -- Papierkorb (Soft-Delete)
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_video_ideas_client on video_ideas (client_id);
create index if not exists idx_video_ideas_active on video_ideas (client_id) where deleted_at is null;

-- --- RLS + Realtime (nur eingeloggtes Team) ---------------------------------
alter table video_ideas enable row level security;
drop policy if exists "team_all_video_ideas" on video_ideas;
create policy "team_all_video_ideas" on video_ideas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'video_ideas'
  ) then
    alter publication supabase_realtime add table video_ideas;
  end if;
end$$;


-- ####################################################################
-- ##  0009_nudges.sql
-- ####################################################################

-- =============================================================================
-- 0009 — Anstupser ("Nudges") + Handy-Push (Web Push)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0008.
--
-- Idee: Jemand macht etwas fertig (z. B. Video-Link hochgeladen) und stupst
-- eine andere Person an ("A: Video 2 ist fertig, kannst posten"). Der Anstupser
-- taucht bei der Person in der Glocke auf; ein Klick öffnet GENAU die Sache.
-- Optional kommt zusätzlich eine echte Push-Benachrichtigung aufs Handy.
-- =============================================================================

-- --- Anstupser ---------------------------------------------------------------
create table if not exists nudges (
  id           uuid primary key default gen_random_uuid(),
  from_name    text,                                  -- wer stupst (Anzeigename)
  to_member_id uuid references team_members (id) on delete cascade,  -- wen
  body         text not null,                         -- kurze Nachricht
  link         text,                                  -- wohin klicken (z. B. /client/<id>?video=<id>)
  read         boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_nudges_member on nudges (to_member_id, read);

-- --- Handy-Push-Abos (ein Eintrag pro Gerät+Person) --------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references team_members (id) on delete cascade,   -- "ich bin auf diesem Gerät = Lion"
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_member on push_subscriptions (member_id);

-- --- RLS + Realtime (nur eingeloggtes Team) ----------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['nudges', 'push_subscriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team_all_%1$s" on %1$I', t);
    execute format(
      'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;

