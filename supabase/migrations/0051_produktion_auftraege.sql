-- =============================================================================
-- 0051 — Produktions-Auftraege: vom Drehtag bis zum fertigen Video
-- =============================================================================
-- Ablauf (Dropbox, je Kunde):
--   _Eingang/              <- nach dem Dreh: Rohclips hier rein, dann im CRM
--                             "Drehtag abschliessen" -> Auftrag mit status 'wartet'
--   1_Videos/<Idee>/       <- Automatik sortiert die Clips je Videoidee
--   2_Feinschliff/<Idee>/  <- Premiere-Projekt + Vorschau (80-90 %) -> Lion
--   3_Fertig/              <- Lions Export -> wird zum Posten geplant
--
-- Die Automatik (stuendlicher Lauf auf dem Schnitt-PC) holt Auftraege mit
-- status 'wartet' ab und schreibt ihren Fortschritt hier hinein. Keine
-- Fristen, keine Ampeln -- nur der Stand, damit man sieht, wo was ist.
--
-- Bewusst ohne DROP: der Supabase-Connector haelt "zerstoererische" Befehle
-- fuer eine Rueckfrage an, die in der App nicht ankommt.
-- =============================================================================

create table if not exists produktion_auftraege (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients (id) on delete cascade,
  ordner       text not null,                 -- Kundenordner in Dropbox
  drehtag      date not null default current_date,
  dateien      int,                           -- Anzahl Clips beim Abschliessen
  status       text not null default 'wartet'
               check (status in ('wartet', 'laeuft', 'feinschliff', 'fertig', 'fehler')),
  schritt      text,                          -- was die Automatik gerade tut (Klartext)
  notiz        text,                          -- Ergebnis/Fehler in Klartext
  created_by   uuid references team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  gestartet_am timestamptz,
  fertig_am    timestamptz,
  deleted_at   timestamptz
);
create index if not exists idx_produktion_auftraege_status on produktion_auftraege (status) where deleted_at is null;
create index if not exists idx_produktion_auftraege_client on produktion_auftraege (client_id, created_at desc);

-- Wo steht ein Video in der Kette?  roh -> feinschliff -> fertig
alter table videos add column if not exists produktion_stufe text
  check (produktion_stufe in ('roh', 'feinschliff', 'fertig'));
alter table videos add column if not exists dropbox_pfad text;   -- Ordner der Idee bzw. fertige Datei
alter table videos add column if not exists auftrag_id uuid references produktion_auftraege (id) on delete set null;

create or replace function produktion_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end$$;
create or replace trigger trg_produktion_touch before update on produktion_auftraege
  for each row execute function produktion_touch();

alter table produktion_auftraege enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'produktion_auftraege' and policyname = 'team_all_produktion_auftraege') then
    create policy "team_all_produktion_auftraege" on produktion_auftraege for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'produktion_auftraege') then
    alter publication supabase_realtime add table produktion_auftraege;
  end if;
end$$;
