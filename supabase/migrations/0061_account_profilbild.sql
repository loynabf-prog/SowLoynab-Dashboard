-- 0061 Profilbild je Account
-- Echte Bilder statt Symbole (Fassie, Okt 2026): jeder Account (z. B. die
-- privaten Accounts von Fassie und Lion in der Personal Brand) bekommt sein
-- eigenes, dauerhaft bei uns gespeichertes Profilbild.
-- Additiv und wiederholbar.

alter table client_accounts add column if not exists profilbild_url text;
alter table client_accounts add column if not exists profilbild_am timestamptz;
