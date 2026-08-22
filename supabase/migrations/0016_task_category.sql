-- =============================================================================
-- 0016 — Farb-Kategorien für Aufgaben
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0015.
--
-- Speichert pro Aufgabe eine Kategorie-Kennung (z. B. "dreh", "schnitt").
-- Die Kategorien selbst (Name + Farbe) liegen frei wählbar in app_settings
-- (kein zusätzliches Feld nötig) und sind in den Einstellungen anpassbar.
-- =============================================================================

alter table tasks add column if not exists category text;
