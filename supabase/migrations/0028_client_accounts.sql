-- =============================================================================
-- 0028 — Mehrere Social-Accounts pro Kunde
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0027.
--
-- Warum: Bis jetzt hatte ein Kunde genau EIN Instagram- und EIN TikTok-Handle.
-- Sobald zwei Betriebe unter einem Kunden laufen (zusammengelegte Kunden,
-- Filialen, Zweitmarken), ist das zu eng -- die Zahlen des zweiten Accounts
-- fielen einfach unter den Tisch.
--
-- Ab hier haengen die Handles in einer eigenen Tabelle, beliebig viele pro
-- Kunde und Plattform. Die alten Spalten clients.handle_ig / handle_tiktok
-- bleiben bestehen und werden per Trigger automatisch auf den jeweils ERSTEN
-- Account gespiegelt -- so laeuft alles weiter, was sie bisher gelesen hat.
--
-- Gefahrlos und wiederholbar: alles mit "if not exists". Bestehende Handles
-- werden automatisch uebernommen, es geht nichts verloren und es muss nichts
-- abgetippt werden.
-- =============================================================================

create table if not exists client_accounts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  platform   text not null,               -- 'instagram' | 'tiktok'
  handle     text not null,               -- ohne fuehrendes @
  -- Klarname des Accounts, z. B. "Schleckofatz" / "Schmackofatz". Nur zur
  -- Anzeige, damit man in der Wachstumskurve die Linien auseinanderhaelt.
  label      text,
  sort       integer not null default 0,  -- kleinste Zahl = Hauptaccount
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_accounts_client on client_accounts (client_id);

-- Denselben Account nicht zweimal beim selben Kunden. Gross-/Kleinschreibung
-- ist bei Handles egal, deshalb ueber lower().
create unique index if not exists idx_client_accounts_uniq
  on client_accounts (client_id, platform, lower(handle));

drop trigger if exists trg_client_accounts_updated_at on client_accounts;
create trigger trg_client_accounts_updated_at
  before update on client_accounts
  for each row execute function set_updated_at();

-- --- RLS + Realtime (nur eingeloggtes Team) ---------------------------------
alter table client_accounts enable row level security;
drop policy if exists "team_all_client_accounts" on client_accounts;
create policy "team_all_client_accounts" on client_accounts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'client_accounts'
  ) then
    alter publication supabase_realtime add table client_accounts;
  end if;
end$$;

-- =============================================================================
-- Tageszahlen je Account
-- =============================================================================
-- client_stats bekommt eine optionale Zuordnung zu einem Account.
--
--   account_id IS NULL  -> die Gesamtzeile des Kunden (alle Accounts addiert,
--                          plus alles von Hand Erfasste). Das ist die Zeile,
--                          die Auswertung und Kundenseite lesen -- so bleiben
--                          alle bestehenden Kurven unveraendert richtig.
--   account_id gesetzt  -> die Zahlen genau eines Accounts, fuer die
--                          Aufschluesselung "welcher Account waechst?".
--
-- Bestehende Zeilen bleiben Gesamtzeilen. Nichts umzurechnen.
alter table client_stats add column if not exists account_id uuid
  references client_accounts (id) on delete cascade;

create index if not exists idx_client_stats_account on client_stats (account_id);

-- Falls sich frueher schon zwei Zeilen fuer denselben Kunden und Tag
-- angesammelt haben (die Eingabe von Hand hat das nie verhindert), wuerde
-- der folgende unique index scheitern. Deshalb vorher aufraeumen: je Tag
-- bleibt die zuletzt angelegte Zeile stehen.
delete from client_stats a
 using client_stats b
 where a.client_id = b.client_id
   and a.captured_on = b.captured_on
   and a.account_id is not distinct from b.account_id
   and (a.created_at, a.id) < (b.created_at, b.id);

-- Eine Zeile je Kunde/Account/Tag -- sonst sammeln sich bei jedem Lauf
-- Dubletten an. Der Ausdruck faengt NULL ab, weil NULL in einem normalen
-- unique index nie mit sich selbst kollidiert.
create unique index if not exists idx_client_stats_tag_uniq
  on client_stats (client_id, captured_on, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- =============================================================================
-- Bestehende Handles uebernehmen
-- =============================================================================
-- Was heute in clients.handle_ig / handle_tiktok steht, wird zum jeweils
-- ersten Account. Doppelte werden durch "on conflict do nothing" ignoriert,
-- der Block darf also mehrfach laufen.
insert into client_accounts (client_id, platform, handle, sort)
select id, 'instagram', regexp_replace(trim(handle_ig), '^@', ''), 0
  from clients
 where handle_ig is not null and trim(handle_ig) <> ''
on conflict do nothing;

insert into client_accounts (client_id, platform, handle, sort)
select id, 'tiktok', regexp_replace(trim(handle_tiktok), '^@', ''), 0
  from clients
 where handle_tiktok is not null and trim(handle_tiktok) <> ''
on conflict do nothing;

-- =============================================================================
-- Rueckwaertskompatibilitaet: erster Account -> clients.handle_*
-- =============================================================================
-- Mehrere Stellen lesen weiterhin clients.handle_ig / handle_tiktok (Suche,
-- Kundenliste, KI-Briefing). Statt sie alle umzubauen, halten wir die beiden
-- Spalten automatisch auf dem Hauptaccount -- also dem mit der kleinsten
-- Sortiernummer. Wer sie liest, bekommt weiter eine sinnvolle Antwort.
create or replace function sync_client_handles() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ziel uuid := coalesce(new.client_id, old.client_id);
begin
  update clients set
    handle_ig = (
      select handle from client_accounts
       where client_id = ziel and platform = 'instagram'
       order by sort, created_at limit 1
    ),
    handle_tiktok = (
      select handle from client_accounts
       where client_id = ziel and platform = 'tiktok'
       order by sort, created_at limit 1
    )
  where id = ziel;
  return null;
end$$;

drop trigger if exists trg_sync_client_handles on client_accounts;
create trigger trg_sync_client_handles
  after insert or update or delete on client_accounts
  for each row execute function sync_client_handles();
