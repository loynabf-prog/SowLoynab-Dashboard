-- =============================================================================
-- 0011 — Live-Links pro Video (für die automatische Statistik)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0010.
--
-- Nach dem Posten hinterlegst du beim Video den TikTok- und/oder Instagram-Link.
-- Ein täglicher Job (Edge Function "refresh-stats") liest darüber automatisch
-- Views/Likes/Kommentare/Shares aus und schreibt sie ins Video + in die
-- Verlaufs-Tabelle video_stats (die es schon gibt).
-- =============================================================================

alter table videos add column if not exists tiktok_url      text;
alter table videos add column if not exists instagram_url   text;
alter table videos add column if not exists stats_updated_at timestamptz;
