-- =============================================================================
-- 0019 — Vertragsende pro Kunde (für den Content-Plan)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0018.
--
-- Damit der automatische Content-Plan (z. B. „alle 3 Tage ein Video") nicht
-- unbegrenzt plant, sondern bis zum Vertragsende. Leer = unbegrenzt.
-- =============================================================================

alter table clients add column if not exists contract_end date;
