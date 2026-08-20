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
