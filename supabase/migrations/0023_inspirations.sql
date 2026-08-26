-- =============================================================================
-- 0023 — Inspirationen (Video-Vorbilder von TikTok / Instagram)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0022.
--
-- Wir sehen staendig fremde Videos, die wir so aehnlich fuer einen Kunden
-- machen wollen. Bisher landeten die Links in WhatsApp und waren weg.
-- Hier bekommen sie einen festen Platz:
--
--   * client_id gesetzt  -> Inspiration fuer genau diesen Kunden
--     (erscheint im Reiter "Inspiration" auf der Kundenseite)
--   * client_id leer     -> allgemeine Inspiration ohne Kunden
--     (erscheint unter Mehr -> Inspirationen in der Spalte "Allgemein")
--
-- Die Zahlen (Aufrufe, Likes …) holt die Edge Function "apify-lookup" beim
-- Einfuegen des Links automatisch. Klappt der Abruf nicht, wird der Link
-- trotzdem gespeichert — nur eben ohne Zahlen.
-- =============================================================================

create table if not exists inspirations (
  id               uuid primary key default gen_random_uuid(),
  -- bewusst NULL erlaubt: allgemeine Inspirationen gehoeren keinem Kunden.
  -- Wird ein Kunde geloescht, rutscht seine Inspiration nach "Allgemein",
  -- statt mit geloescht zu werden.
  client_id        uuid references clients (id) on delete set null,
  url              text not null,
  platform         text not null default 'other',   -- tiktok | instagram | other
  title            text,                            -- Caption/Kurzbeschreibung
  author           text,                            -- @Name des Urhebers
  thumbnail_url    text,
  notes            text,                            -- "warum merken wir uns das?"
  views            integer,
  likes            integer,
  comments         integer,
  shares           integer,
  saves            integer,
  duration_seconds integer,
  posted_at        timestamptz,
  stats_updated_at timestamptz,
  deleted_at       timestamptz,                     -- Papierkorb (Soft-Delete)
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_inspirations_client on inspirations (client_id);
create index if not exists idx_inspirations_active on inspirations (created_at desc) where deleted_at is null;

-- --- RLS + Realtime (nur eingeloggtes Team) ---------------------------------
alter table inspirations enable row level security;
drop policy if exists "team_all_inspirations" on inspirations;
create policy "team_all_inspirations" on inspirations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'inspirations'
  ) then
    alter publication supabase_realtime add table inspirations;
  end if;
end$$;
