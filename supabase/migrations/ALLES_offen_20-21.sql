-- =============================================================================
-- ALLES OFFEN 20–21 — Sammel-Skript für die Apify-Anbindung
-- =============================================================================
-- Fasst 0020 + 0021 zusammen, damit du im Supabase SQL Editor nur EINMAL
-- einfügen und "Run" drücken musst.
--
-- Gefahrlos: alles mit "if not exists" — mehrfaches Ausführen schadet nicht.
-- Wenn 0020/0021 einzeln schon liefen, passiert hier einfach nichts mehr.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0020 — Zahlen getrennt nach Instagram / TikTok (Vergleich + Filter)
-- -----------------------------------------------------------------------------
-- Bisher wurden Views/Likes/Kommentare nur als gemeinsame Summe gespeichert.
-- Für den Plattform-Vergleich (IG vs. TikTok) kommen die Zahlen zusätzlich
-- getrennt dazu. Die bestehenden Summenfelder bleiben die "Gesamt"-Anzeige.

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


-- -----------------------------------------------------------------------------
-- 0021 — Account-Zahlen pro Kunde (Following / Anzahl Posts)
-- -----------------------------------------------------------------------------
-- client_stats gab es schon (Follower-Verlauf, bisher nur manuell über
-- "+ Zahlen erfassen"). Für die automatische Apify-Anbindung ergänzen wir
-- Following- und Post-Anzahl pro Plattform. Die Follower-Spalten
-- (followers_ig / followers_tiktok) existieren schon seit Migration 0007.
--
-- Video-Länge (videos.duration_seconds) gibt es schon seit 0001 — die wird
-- ab jetzt nur automatisch mitbefüllt, dafür braucht es kein neues Feld.

alter table client_stats add column if not exists following_ig     integer;
alter table client_stats add column if not exists following_tiktok integer;
alter table client_stats add column if not exists posts_ig         integer;
alter table client_stats add column if not exists posts_tiktok     integer;


-- =============================================================================
-- Fertig. Danach am PC noch:
--   1. Secret APIFY_TOKEN setzen (Edge Functions -> Secrets)
--   2. Funktionen deployen: refresh-stats, refresh-account-stats,
--      apify-lookup, apify-places-search
--   3. Cron einrichten: refresh-stats + refresh-account-stats
-- Siehe docs/OFFENE_EINRICHTUNG.md
-- =============================================================================
