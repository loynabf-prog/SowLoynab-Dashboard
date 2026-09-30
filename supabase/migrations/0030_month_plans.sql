-- =============================================================================
-- 0030 — Videomenge je Monat
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0029.
--
-- Der Retainer sagt, wie viele Videos ein Kunde normalerweise im Monat
-- bekommt (clients.monthly_quota). In einzelnen Monaten weicht das ab --
-- Urlaub, Aktion, Saison. Bisher musste man dafuer den Retainer selbst
-- aendern und hinterher zuruecksetzen.
--
-- Hier steht die Ausnahme: eine Zeile je Kunde und Monat. Gibt es keine,
-- gilt der Retainer. Nichts aendert sich fuer Kunden ohne Ausnahme.
--
-- Gefahrlos und wiederholbar: alles mit "if not exists".
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
