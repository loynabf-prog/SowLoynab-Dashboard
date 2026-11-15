-- 0080: Altlasten raus (15.11.2026, "CRM auf 10/10").
-- Leere Tabellen ohne jede Verwendung im Code. time_entries ist durch
-- jobs/zeit_sessions (0079) ersetzt. Alle drei waren leer.
drop table if exists automations;
drop table if exists reminders;
drop table if exists time_entries;
-- Mail-Sync ist nie gelaufen (Zoho nicht verbunden); Postfach liegt im Archiv.
delete from system_status where job = 'mail-sync';
