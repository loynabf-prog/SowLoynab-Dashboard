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
