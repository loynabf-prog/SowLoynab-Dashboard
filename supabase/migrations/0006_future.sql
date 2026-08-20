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
