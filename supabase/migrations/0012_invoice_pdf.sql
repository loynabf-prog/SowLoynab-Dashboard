-- =============================================================================
-- 0012 — Felder für echte PDF-Rechnungen
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0011.
--
-- Ergänzt die Rechnungen um alles, was eine ordentliche deutsche Rechnung
-- braucht: Empfänger-Adresse, USt-Satz, Leistungszeitraum, optionale Positionen.
-- Die Absender-/Firmendaten liegen in app_settings (kein neues Feld nötig).
-- =============================================================================

alter table invoices add column if not exists recipient      text;           -- Rechnungsempfänger (mehrzeilige Adresse)
alter table invoices add column if not exists service_period text;           -- Leistungszeitraum / -datum
alter table invoices add column if not exists vat_rate       numeric(5,2) default 0;  -- 0 = Kleinunternehmer, sonst z. B. 19
alter table invoices add column if not exists items          jsonb;          -- optionale Positionen [{desc, qty, price}]
