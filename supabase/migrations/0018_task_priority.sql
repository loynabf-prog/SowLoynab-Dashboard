-- =============================================================================
-- 0018 — Dringlichkeit / Priorität für Aufgaben
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0017.
--
-- 3 = dringend (rot), 2 = wichtig (gelb), 1 = kann warten (grün), 0 = ohne.
-- Erlaubt ein Aufgaben-Dashboard nach Rangordnung (unabhängig vom Datum).
-- =============================================================================

alter table tasks add column if not exists priority smallint not null default 0;

create index if not exists tasks_priority_idx on tasks (priority desc) where priority > 0;
