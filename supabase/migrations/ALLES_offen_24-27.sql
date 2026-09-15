-- =============================================================================
-- ALLES OFFEN 24–27 — Sammel-Skript
-- =============================================================================
-- Fasst 0024 + 0025 + 0026 + 0027 zusammen: im Supabase SQL Editor EINMAL
-- einfügen, "Run" drücken, fertig.
--
-- Gefahrlos: alles mit "if not exists" bzw. "drop policy if exists" —
-- mehrfaches Ausführen schadet nicht. Was einzeln schon lief, wird hier
-- einfach übersprungen. Auch die Beispiel-Pakete kommen nur beim allerersten
-- Mal; spätere Preisänderungen bleiben erhalten.
--
-- Voraussetzung: ALLES_offen_20-23.sql ist schon gelaufen.
--
-- Danach ist in der App freigeschaltet:
--   * Einstellungen -> Pakete (Basis / Wachstum / Marktführer)
--   * Kundenseite -> Vertrag anlegen und vom Kunden bestätigen lassen
--   * Kunden -> Marke (Sow & Loynab / Creator Scout)
--   * Kunden -> Kundenart (zahlend / Referenz / passiv)
-- =============================================================================



-- =============================================================================
-- 0024 — Standard-Pakete (Basis / Wachstum / Marktführer)
-- =============================================================================

-- Wir bieten drei Grundpakete an. Statt bei jedem Kunden Preis und
-- Videomenge neu zu tippen, liegen sie hier einmal fest und werden beim
-- Kunden mit einem Klick uebernommen. Ueberschreiben bleibt jederzeit
-- moeglich -- das Paket ist eine Vorlage, keine Fessel.
--
-- Preise und Mengen aenderst du unter Mehr -> Einstellungen -> Pakete.

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


-- =============================================================================
-- 0025 — Rahmenverträge mit elektronischer Unterschrift
-- =============================================================================

-- Pro Kunde ein Rahmenvertrag: im Dashboard anlegen, Link verschicken, der
-- Kunde unterschreibt ohne Login. Dasselbe sichere Muster wie bei der
-- Video-Freigabe (Skript 10): die Tabelle bleibt komplett gesperrt, nur zwei
-- Funktionen geben genau die noetigen Daten frei.
--
-- Zum Beweiswert: Das ist eine EINFACHE elektronische Signatur (Name tippen,
-- bestaetigen). Fuer Dienstvertraege wie unsere reicht das -- sie sind
-- formfrei, es gilt keine Schriftform. Wir protokollieren Zeitpunkt, Name und
-- den Vertragstext im Wortlaut, damit spaeter nachweisbar ist, WAS
-- unterschrieben wurde.

create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  title         text not null default 'Rahmenvertrag',
  -- Der vollstaendige Vertragstext zum Zeitpunkt des Versendens. Bewusst als
  -- Kopie und nicht als Verweis auf eine Vorlage: aendern wir spaeter die
  -- Vorlage, muss der bereits unterschriebene Vertrag unveraendert bleiben.
  body          jsonb not null,
  status        text not null default 'draft',  -- draft | sent | signed | cancelled
  -- Oeffentlicher Link. Wird erst beim Versenden gesetzt.
  token         uuid unique default gen_random_uuid(),
  sent_at       timestamptz,
  signed_at     timestamptz,
  signer_name   text,                            -- wer beim Kunden unterschrieben hat
  signer_role   text,                            -- Funktion, z. B. "Inhaber"
  starts_on     date,
  ends_on       date,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_contracts_client on contracts (client_id) where deleted_at is null;
create index if not exists idx_contracts_token on contracts (token);

-- --- RLS: nur das eingeloggte Team ------------------------------------------
alter table contracts enable row level security;
drop policy if exists "team_all_contracts" on contracts;
create policy "team_all_contracts" on contracts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- --- Oeffentlicher Zugriff NUR ueber diese zwei Funktionen -------------------

-- Vertrag per Token lesen. Gibt nur heraus, was zum Lesen und Unterschreiben
-- noetig ist -- keine internen Felder, keine anderen Kunden.
create or replace function public.get_contract_by_token(t uuid)
returns table (
  id          uuid,
  title       text,
  body        jsonb,
  status      text,
  signed_at   timestamptz,
  signer_name text,
  starts_on   date,
  client_name text
)
language sql
security definer
set search_path = public
as $$
  select k.id, k.title, k.body, k.status, k.signed_at, k.signer_name,
         k.starts_on, c.name
  from contracts k
  join clients c on c.id = k.client_id
  where k.token = t
    and k.deleted_at is null
    and k.status in ('sent', 'signed')
$$;

-- Unterschreiben. Nur moeglich, solange der Vertrag versendet und noch nicht
-- unterschrieben ist -- ein zweiter Klick aendert nichts mehr.
create or replace function public.sign_contract(t uuid, name text, role text)
returns void
language sql
security definer
set search_path = public
as $$
  update contracts
     set status      = 'signed',
         signed_at   = now(),
         signer_name = nullif(btrim(coalesce(name, '')), ''),
         signer_role = nullif(btrim(coalesce(role, '')), '')
   where token = t
     and deleted_at is null
     and status = 'sent'
     and btrim(coalesce(name, '')) <> ''
$$;

grant execute on function public.get_contract_by_token(uuid) to anon, authenticated;
grant execute on function public.sign_contract(uuid, text, text) to anon, authenticated;

-- --- Realtime ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'contracts'
  ) then
    alter publication supabase_realtime add table contracts;
  end if;
end$$;


-- =============================================================================
-- 0026 — Zwei Marken: Sow & Loynab Media und Creator Scout
-- =============================================================================

-- Wir arbeiten unter zwei Namen und produzieren dafuer sehr verschiedenen
-- Content:
--
--   media    = Sow & Loynab Media  -> Unternehmen, Gastronomie
--   creator  = Creator Scout       -> Personenmarken, Creator
--
-- Bestehende Kunden werden alle "media" -- das war bisher das Geschaeft.
-- Umstellen geht danach pro Kunde im Fenster "Kunde bearbeiten".

alter table clients add column if not exists brand text not null default 'media';

create index if not exists idx_clients_brand on clients (brand) where deleted_at is null;


-- =============================================================================
-- 0027 — Kundenart: zahlend / Ehrenamt-Referenz / passiv
-- =============================================================================

-- Bisher standen alle Kunden in einer Liste. Wer Geld bringt, ging damit
-- zwischen Ehrenamts- und Referenzprojekten unter -- und genau die zahlenden
-- Kunden gehoeren zuerst gesehen.
--
--   zahlend  = zahlender Kunde
--   referenz = Ehrenamt / Referenzprojekt (kein oder symbolisches Honorar)
--   passiv   = abgeschlossen oder pausiert; bleibt als Nachschlagewerk
--
-- Bestehende Kunden werden "zahlend" -- ausser den bereits auf inaktiv
-- gesetzten, die werden "passiv".

alter table clients add column if not exists client_type text not null default 'zahlend';

update clients set client_type = 'passiv' where active = false and client_type = 'zahlend';

create index if not exists idx_clients_type on clients (client_type) where deleted_at is null;
