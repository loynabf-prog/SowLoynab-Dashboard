-- =============================================================================
-- 0003 — Externer Video-Link (z. B. iCloud-Freigabe)
-- =============================================================================
-- Im Supabase SQL Editor einfuegen und "Run". Reihenfolge nach 0002.
-- =============================================================================

-- Link zur fertigen Videodatei (iCloud / Drive / Dropbox ...).
-- Das Video liegt extern, das Dashboard verlinkt nur darauf -> verlustfrei,
-- keine eigene Speicher-Infrastruktur noetig.
alter table videos add column if not exists video_url text;
