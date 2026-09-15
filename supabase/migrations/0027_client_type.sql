-- =============================================================================
-- 0027 — Kundenart: zahlend, Ehrenamt/Referenz, passiv
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0026.
--
-- Bisher standen alle Kunden in einer Liste. Wer Geld bringt, ging damit
-- zwischen Ehrenamts- und Referenzprojekten unter -- und genau die zahlenden
-- Kunden gehoeren zuerst gesehen.
--
--   zahlend  = zahlender Kunde
--   referenz = Ehrenamt / Referenzprojekt (kein oder symbolisches Honorar)
--   passiv   = abgeschlossen oder pausiert; bleibt als Nachschlagewerk
--
-- Bestehende Kunden werden "zahlend" -- ausser den bereits auf inaktiv
-- gesetzten, die werden "passiv".
-- =============================================================================

alter table clients add column if not exists client_type text not null default 'zahlend';

update clients set client_type = 'passiv' where active = false and client_type = 'zahlend';

create index if not exists idx_clients_type on clients (client_type) where deleted_at is null;
