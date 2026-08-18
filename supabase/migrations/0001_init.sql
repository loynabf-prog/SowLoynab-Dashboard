-- =============================================================================
-- Sow & Loynab Dashboard — Initiale Datenbank-Struktur
-- =============================================================================
-- So spielst du das ein:
--   Supabase-Dashboard -> SQL Editor -> New query -> gesamten Inhalt einfuegen
--   -> "Run". Das Skript ist idempotent-freundlich (IF NOT EXISTS wo moeglich).
-- =============================================================================

-- --- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto";  -- fuer gen_random_uuid()

-- --- Enum: Video-Status -----------------------------------------------------
-- todo   = "Zu bearbeiten"
-- ready  = "Bereit zum Post"
-- posted = "Gepostet"
do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_status') then
    create type video_status as enum ('todo', 'ready', 'posted');
  end if;
end$$;

-- --- Helper: updated_at automatisch pflegen ---------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- Tabelle: clients (Kunden)
-- =============================================================================
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  handle_ig     text,
  handle_tiktok text,
  notes         text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- =============================================================================
-- Tabelle: videos
-- =============================================================================
create table if not exists videos (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients (id) on delete cascade,
  title          text not null default 'Neues Video',
  status         video_status not null default 'todo',
  scheduled_date date,
  caption        text,
  notes          text,

  -- Bunny: Master (verlustfrei) in Storage, Preview optional ueber Stream
  storage_path   text,           -- Pfad in der Bunny Storage Zone
  bunny_stream_id text,          -- optionale Preview-Video-ID in Bunny Stream
  file_size      bigint,         -- Bytes
  duration_seconds integer,

  posted_ig      boolean not null default false,
  posted_tiktok  boolean not null default false,

  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_videos_updated_at on videos;
create trigger trg_videos_updated_at
  before update on videos
  for each row execute function set_updated_at();

-- Index fuer schnelles Laden der Videos pro Kunde
create index if not exists idx_videos_client_id on videos (client_id);
create index if not exists idx_videos_status on videos (status);

-- =============================================================================
-- Row-Level-Security
-- =============================================================================
-- v1-Regel bewusst simpel: JEDES eingeloggte Team-Mitglied darf alles lesen
-- und schreiben. Anonyme (nicht eingeloggte) Zugriffe sind komplett gesperrt.
-- Spaeter kann man das pro Rolle/Team verfeinern, ohne das Frontend zu aendern.
-- =============================================================================

alter table clients enable row level security;
alter table videos  enable row level security;

-- clients
drop policy if exists "team_read_clients"   on clients;
drop policy if exists "team_insert_clients" on clients;
drop policy if exists "team_update_clients" on clients;
drop policy if exists "team_delete_clients" on clients;

create policy "team_read_clients"   on clients for select using (auth.role() = 'authenticated');
create policy "team_insert_clients" on clients for insert with check (auth.role() = 'authenticated');
create policy "team_update_clients" on clients for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team_delete_clients" on clients for delete using (auth.role() = 'authenticated');

-- videos
drop policy if exists "team_read_videos"   on videos;
drop policy if exists "team_insert_videos" on videos;
drop policy if exists "team_update_videos" on videos;
drop policy if exists "team_delete_videos" on videos;

create policy "team_read_videos"   on videos for select using (auth.role() = 'authenticated');
create policy "team_insert_videos" on videos for insert with check (auth.role() = 'authenticated');
create policy "team_update_videos" on videos for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team_delete_videos" on videos for delete using (auth.role() = 'authenticated');

-- =============================================================================
-- Realtime: Aenderungen live an alle eingeloggten Clients pushen
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table clients;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'videos'
  ) then
    alter publication supabase_realtime add table videos;
  end if;
end$$;
