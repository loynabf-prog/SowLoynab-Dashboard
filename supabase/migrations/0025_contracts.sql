-- =============================================================================
-- 0025 — Rahmenverträge mit elektronischer Unterschrift
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0024.
--
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
-- =============================================================================

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
