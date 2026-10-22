-- Neue Dropbox-Struktur (22.10.2026): der Ordner ist der Status.
--   1 Eingang/<Kunde>  ->  2 Im Schnitt/<Kunde> - <Idee>  ->  3 Feinschliff/<Kunde> - <Idee>
--   ->  4 Fertig/<Kunde> - <Idee>.mp4  ->  Kunden/<Kunde>/Videos/<Datum> <Idee>
-- Kundenordner: /Sow & Loynab Media/Kunden/<Kunde> (eigener Account: Kunden/_Eigener Account).
-- Anleitung: Agentur/Automatik/Pipeline.md in Dropbox.

update clients set dropbox_ordner = array(
  select replace(replace(x,
    '/Sow & Loynab Media/01_Kunden/', '/Sow & Loynab Media/Kunden/'),
    '/Sow & Loynab Media/02_Eigener Account', '/Sow & Loynab Media/Kunden/_Eigener Account')
  from unnest(dropbox_ordner) x)
where dropbox_ordner is not null;

-- Drive-Import zielt jetzt auf 1 Eingang/<Kunde>
alter table drive_importe drop constraint if exists drive_importe_ziel_check;
update drive_importe
   set ziel = regexp_replace(ziel, '^/Sow & Loynab Media/01_Kunden/([^/]+)/_Eingang$', '/Sow & Loynab Media/1 Eingang/\1')
 where ziel ~ '^/Sow & Loynab Media/01_Kunden/[^/]+/_Eingang$';
alter table drive_importe add constraint drive_importe_ziel_check
  check (ziel ~ '^/Sow & Loynab Media/1 Eingang/[^/]+$');
