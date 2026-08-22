-- =============================================================================
-- 0014 — Systemstatus (macht stille Hintergrund-Fehler sichtbar)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0013.
--
-- Die Cron-Funktionen (mail-sync, refresh-stats) schreiben hier ihren letzten
-- Erfolg bzw. Fehler rein. Die App zeigt das unter Einstellungen an — so merkst
-- du sofort, wenn z. B. der Mail-Abruf seit Stunden klemmt.
-- =============================================================================

create table if not exists system_status (
  job           text primary key,
  last_ok       timestamptz,
  last_error    text,
  last_error_at timestamptz,
  detail        text,
  updated_at    timestamptz not null default now()
);

alter table system_status enable row level security;
drop policy if exists "team_read_status" on system_status;
-- Nur lesen fürs eingeloggte Team; geschrieben wird per Service-Role (Cron-Funktionen)
create policy "team_read_status" on system_status for select
  using (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'system_status'
  ) then
    execute 'alter publication supabase_realtime add table system_status';
  end if;
end $$;
