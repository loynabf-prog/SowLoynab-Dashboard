-- 0069: Kontrollstempel je Kunde und Monat ("geprueft bis").
-- ---------------------------------------------------------------------------
-- Fassie (29.10.2026): "Ich habe bei U-Act den Oktober kontrolliert -- alle
-- Videos drin, Links geholt, Klicks gezogen. Das will ich festhalten, damit
-- ich bei der naechsten Kontrolle weiss: bis dahin ist alles sauber."
--
-- Der Stempel ist ein DATUM, kein Monatsschalter: "geprueft bis 15.10." heisst,
-- alles bis zum 15. ist kontrolliert; was danach gepostet wird, prueft man
-- beim naechsten Mal. Steht der Stempel auf dem Monatsende, ist der Monat
-- gruen. Posten darf man danach trotzdem -- der Pilot erinnert nur noch an
-- das, was NACH dem Stempel liegt.

create table if not exists monats_kontrollen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  geprueft_bis date not null,
  geprueft_am timestamptz not null default now(),
  geprueft_von uuid references team_members(id),
  notiz text,
  unique (client_id, month_key)
);

alter table monats_kontrollen enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'monats_kontrollen' and policyname = 'team_alles') then
    create policy team_alles on monats_kontrollen for all using (true) with check (true);
  end if;
end $$;
grant all on monats_kontrollen to anon, authenticated, service_role;

comment on table monats_kontrollen is 'Kontrollstempel (0069): je Kunde und Monat das Datum, bis zu dem alles geprueft ist (Posts im CRM, Links, Zahlen).';

-- Sicht pilot_kunden um den Stempel erweitern (neue Spalten nur hinten
-- anhaengen -- create or replace view erlaubt keine Umsortierung).
-- links_fehlen und zahlen_alt zaehlen nur noch Videos NACH dem Stempel.
-- Komplette Definition: siehe 0068_pilot.sql; hier der Unterschied:
--   geprueft_bis          hoechster Stempel des Kunden ueber alle Monate
--   monat_geprueft_bis    Stempel des laufenden Monats
--   vormonat_geprueft_bis Stempel des Vormonats
