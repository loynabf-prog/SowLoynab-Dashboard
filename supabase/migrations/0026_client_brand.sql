-- =============================================================================
-- 0026 — Zwei Marken: Unternehmenskunden und Personenmarken
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0025.
--
-- Wir arbeiten unter zwei Namen und produzieren dafuer sehr verschiedenen
-- Content:
--
--   media    = Sow & Loynab Media  -> Unternehmen, Gastronomie
--   creator  = Creator Scout       -> Personenmarken, Creator
--
-- Bestehende Kunden werden alle "media" -- das war bisher das Geschaeft.
-- Umstellen geht danach pro Kunde im Fenster "Kunde bearbeiten".
-- =============================================================================

alter table clients add column if not exists brand text not null default 'media';

create index if not exists idx_clients_brand on clients (brand) where deleted_at is null;
