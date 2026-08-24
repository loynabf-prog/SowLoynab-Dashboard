-- =============================================================================
-- 0020 — Zahlen getrennt nach Instagram / TikTok (für Vergleich + Filter)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0019.
--
-- Bisher wurden Views/Likes/Kommentare nur als eine gemeinsame Summe
-- gespeichert (views/likes/comments/shares/saves). Für den Plattform-
-- Vergleich (IG vs. TikTok) brauchen wir die Zahlen zusätzlich getrennt.
-- Die bestehenden Summenfelder bleiben unverändert die "Gesamt"-Anzeige.
-- =============================================================================

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
