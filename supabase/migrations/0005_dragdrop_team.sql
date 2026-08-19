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
