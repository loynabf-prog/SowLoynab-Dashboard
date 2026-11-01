-- 0072: Kalender -- Kategorie (Farbe) und Herkunft fuer importierte Termine
--   kategorie   kunde | sport | privat | ehrenamt | uni | arbeit | termin
--               (leer = aus "kind" abgeleitet)
--   extern_id   ID aus dem Handy-Kalender, damit ein zweiter Import nichts doppelt anlegt
alter table events add column if not exists kategorie text;
alter table events add column if not exists extern_id text;
create unique index if not exists events_extern_id_uq on events (extern_id) where extern_id is not null;
