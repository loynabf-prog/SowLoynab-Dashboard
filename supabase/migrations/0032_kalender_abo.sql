-- =============================================================================
-- 0032 — Termine + Kalender-Abo fürs Handy
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0031.
--
-- Zwei Dinge:
--
-- 1. TERMINE. Bisher kannte die App nur Videos und Aufgaben. Was fehlt, ist
--    alles andere, was den Tag belegt: Arbeitszeiten, Spiele, einzelne
--    Termine. Ohne die weiss der eine nie, wann der andere kann.
--
--    member_ids leer  -> gilt fuer alle (gemeinsamer Termin)
--    member_ids gefuellt -> gilt nur fuer die Genannten
--
-- 2. ABO-SCHLUESSEL je Person. Damit kann jeder "seinen" Kalender auf dem
--    iPhone abonnieren: die gemeinsamen Termine plus die eigenen, nicht die
--    privaten des anderen.
--
--    Der Schluessel ist ein Passwort. Wer ihn hat, sieht den Dienstplan --
--    ohne Login. Er laesst sich in den Einstellungen jederzeit neu
--    erzeugen, falls mal ein Handy abhandenkommt.
--
-- Gefahrlos und wiederholbar.
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
