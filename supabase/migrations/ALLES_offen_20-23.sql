-- =============================================================================
-- ALLES OFFEN 20–23 — Sammel-Skript
-- =============================================================================
-- Fasst 0020 + 0021 + 0022 + 0023 zusammen: im Supabase SQL Editor EINMAL
-- einfügen, "Run" drücken, fertig.
--
-- Gefahrlos: alles mit "if not exists" bzw. "drop policy if exists" —
-- mehrfaches Ausführen schadet nicht. Was einzeln schon lief, wird hier
-- einfach übersprungen.
--
-- Danach am PC noch:
--   1. Secret APIFY_TOKEN setzen (Edge Functions -> Secrets)
--   2. Funktionen deployen: apify-lookup, refresh-stats,
--      refresh-account-stats, apify-places-search
--   3. Cron einrichten: ALLES_offen_cron.sql ausführen
-- =============================================================================



-- =============================================================================
-- 0020 — Zahlen getrennt nach Instagram / TikTok
-- =============================================================================

-- Bisher wurden Views/Likes/Kommentare nur als eine gemeinsame Summe
-- gespeichert (views/likes/comments/shares/saves). Für den Plattform-
-- Vergleich (IG vs. TikTok) brauchen wir die Zahlen zusätzlich getrennt.
-- Die bestehenden Summenfelder bleiben unverändert die "Gesamt"-Anzeige.

alter table videos add column if not exists views_ig       integer;
alter table videos add column if not exists likes_ig       integer;
alter table videos add column if not exists comments_ig    integer;
alter table videos add column if not exists shares_ig      integer;
alter table videos add column if not exists saves_ig       integer;

alter table videos add column if not exists views_tiktok    integer;
alter table videos add column if not exists likes_tiktok    integer;
alter table videos add column if not exists comments_tiktok integer;
alter table videos add column if not exists shares_tiktok   integer;
alter table videos add column if not exists saves_tiktok    integer;


-- =============================================================================
-- 0021 — Account-Zahlen (Follower / Following / Posts)
-- =============================================================================

-- client_stats gab es schon (Follower-Verlauf, bisher nur manuell über
-- "+ Zahlen erfassen"). Für die automatische Apify-Anbindung ergänzen wir
-- Following- und Post-Anzahl pro Plattform. Die Follower-Spalten
-- (followers_ig/followers_tiktok) existieren schon seit Migration 0007.

alter table client_stats add column if not exists following_ig     integer;
alter table client_stats add column if not exists following_tiktok integer;
alter table client_stats add column if not exists posts_ig         integer;
alter table client_stats add column if not exists posts_tiktok     integer;

-- Video-Länge in Sekunden -- Spalte gab es schon (0001), wurde bisher nie
-- automatisch befüllt. Kein neues Feld nötig, nur die Funktionen liefern's
-- jetzt mit.


-- =============================================================================
-- 0022 — Uhrzeit für Aufgaben
-- =============================================================================

-- Aufgaben hatten bisher nur ein Datum. Mit einer Uhrzeit wird aus einer
-- Aufgabe ein echter Termin ("14:00 Dreh bei Sahin") — sie erscheint dann
-- im Tagesplan auf der Startseite und mit Zeit im Kalender.
--
-- Leer = Aufgabe ohne feste Uhrzeit (wie bisher).

alter table tasks add column if not exists due_time time;


-- =============================================================================
-- 0023 — Inspirationen (gemerkte Fremd-Videos)
-- =============================================================================

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
