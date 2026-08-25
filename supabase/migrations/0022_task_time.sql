-- =============================================================================
-- 0022 — Uhrzeit für Aufgaben (Termine im Kalender)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0021.
--
-- Aufgaben hatten bisher nur ein Datum. Mit einer Uhrzeit wird aus einer
-- Aufgabe ein echter Termin ("14:00 Dreh bei Sahin") — sie erscheint dann
-- im Tagesplan auf der Startseite und mit Zeit im Kalender.
--
-- Leer = Aufgabe ohne feste Uhrzeit (wie bisher).
-- =============================================================================

alter table tasks add column if not exists due_time time;
