-- =============================================================================
-- 0021 — Mehr Account-Zahlen (Following/Posts) + Video-Länge
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0020.
--
-- client_stats gab es schon (Follower-Verlauf, bisher nur manuell über
-- "+ Zahlen erfassen"). Für die automatische Apify-Anbindung ergänzen wir
-- Following- und Post-Anzahl pro Plattform. Die Follower-Spalten
-- (followers_ig/followers_tiktok) existieren schon seit Migration 0007.
-- =============================================================================

alter table client_stats add column if not exists following_ig     integer;
alter table client_stats add column if not exists following_tiktok integer;
alter table client_stats add column if not exists posts_ig         integer;
alter table client_stats add column if not exists posts_tiktok     integer;

-- Video-Länge in Sekunden -- Spalte gab es schon (0001), wurde bisher nie
-- automatisch befüllt. Kein neues Feld nötig, nur die Funktionen liefern's
-- jetzt mit.
