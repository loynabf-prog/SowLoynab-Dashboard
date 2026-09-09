-- =============================================================================
-- 0024 — Standard-Pakete (Angebots-Bausteine)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0023.
--
-- Wir bieten drei Grundpakete an. Statt bei jedem Kunden Preis und
-- Videomenge neu zu tippen, liegen sie hier einmal fest und werden beim
-- Kunden mit einem Klick uebernommen. Ueberschreiben bleibt jederzeit
-- moeglich -- das Paket ist eine Vorlage, keine Fessel.
--
-- Preise und Mengen aenderst du unter Mehr -> Einstellungen -> Pakete.
-- =============================================================================

create table if not exists packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price_monthly numeric(10,2),
  videos_min    integer,
  videos_max    integer,
  notes         text,              -- was sonst noch drin ist
  sort_order    integer not null default 0,
  active        boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_packages_sort on packages (sort_order) where deleted_at is null;

-- --- RLS + Realtime (nur eingeloggtes Team) ---------------------------------
alter table packages enable row level security;
drop policy if exists "team_all_packages" on packages;
create policy "team_all_packages" on packages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'packages'
  ) then
    alter publication supabase_realtime add table packages;
  end if;
end$$;

-- --- Die drei Grundpakete ----------------------------------------------------
-- Nur beim allerersten Durchlauf; laeuft das Skript nochmal, bleibt alles
-- so, wie du es inzwischen angepasst hast.
insert into packages (name, price_monthly, videos_min, videos_max, notes, sort_order)
select * from (values
  ('Basis',      1000.00, 4,  6,  'Konzept, Dreh, Schnitt, Posting auf Instagram und TikTok', 1),
  ('Wachstum',   2000.00, 8,  12, 'Wie Basis, plus monatliche Auswertung und Content-Plan',   2),
  ('Marktführer',3000.00, 12, 18, 'Wie Wachstum, plus laufende Betreuung und Community-Management', 3)
) as v(name, price_monthly, videos_min, videos_max, notes, sort_order)
where not exists (select 1 from packages);
