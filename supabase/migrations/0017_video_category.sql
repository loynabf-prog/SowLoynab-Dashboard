-- =============================================================================
-- 0017 — Farb-Kategorie für Videos (farbiger Ring ums Logo im Kalender)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0016.
--
-- Dieselben frei wählbaren Kategorien wie bei Aufgaben (aus app_settings) –
-- ein Video kann so z. B. rot markiert werden ("dringend / Dreh").
-- =============================================================================

alter table videos add column if not exists category text;
