-- 0059: Video-Lexikon -- Formate und Videoideen je Branche
-- ---------------------------------------------------------------------------
-- Fassie (26.10.2026): "Ich will ein richtiges Lexikon von Videos" -- pro
-- Branche (z. B. Fahrschule) sehr viele allgemein gehaltene Videoideen und
-- wiederholbare Formate, abgeleitet aus Partnerbranchen (Piloten, Fitness,
-- Polizei ...) und aus dem, was in der Branche selbst funktioniert.
--
-- Allgemein heisst: kein Kunde, keine Stadt. Beispiel: "Bekannter Ort in der
-- Stadt, Fahrlehrer erklaert dort Gefahren" -- erst wenn eine Idee fuer einen
-- Kunden uebernommen wird, wird sie konkret (Fahrschule Hajo, Ludgerikreisel)
-- und landet im Ideenspeicher des Kunden (video_ideas.lexikon_id).
--
-- typ 'format' = wiederholbare Serie (Aufbau bleibt, Inhalt wechselt)
-- typ 'idee'   = einzelne Videoidee, optional einem Format zugeordnet

create table if not exists public.lexikon_eintraege (
  id            uuid primary key default gen_random_uuid(),
  branche       text not null,                         -- 'Fahrschule', 'Gastro', 'Fitness' ...
  typ           text not null default 'idee' check (typ in ('format', 'idee')),
  titel         text not null,
  beschreibung  text,                                  -- worum geht's, allgemein formuliert
  aufbau        text,                                  -- Ablauf: Hook -> ... -> CTA
  kategorie     text check (kategorie in ('werbung', 'sympathie', 'expertise', 'entertainment')),
  quelle        text,                                  -- Partnerbranche / Herkunft, z. B. 'Piloten'
  belege        text,                                  -- Beispiel-Links + Zahlen, je Zeile eins
  format_id     uuid references public.lexikon_eintraege(id) on delete set null,
  tags          text[] not null default '{}',
  sort_order    integer,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists lexikon_branche_idx on public.lexikon_eintraege (branche) where deleted_at is null;
create index if not exists lexikon_format_idx on public.lexikon_eintraege (format_id);

alter table public.lexikon_eintraege enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lexikon_eintraege' and policyname = 'team_all_lexikon') then
    create policy "team_all_lexikon" on public.lexikon_eintraege
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- updated_at automatisch nachziehen
create or replace function public.lexikon_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create or replace trigger lexikon_touch before update on public.lexikon_eintraege
  for each row execute function public.lexikon_touch();

-- Welche Kunden-Idee kam aus welchem Lexikon-Eintrag? (zeigt "2× genutzt")
alter table public.video_ideas add column if not exists lexikon_id uuid
  references public.lexikon_eintraege(id) on delete set null;
create index if not exists video_ideas_lexikon_idx on public.video_ideas (lexikon_id);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lexikon_eintraege') then
    alter publication supabase_realtime add table public.lexikon_eintraege;
  end if;
end $$;
