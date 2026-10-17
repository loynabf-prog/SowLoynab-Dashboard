-- =============================================================================
-- 0038 — Medien aus Dropbox im Dashboard
-- =============================================================================
-- Reihenfolge nach 0037. Gefahrlos und wiederholbar.
--
-- Dropbox bleibt der Speicher, das Dashboard wird die Oberflaeche davor.
-- Die Dateien selbst liegen NIE in Supabase -- nur, welcher Kunde zu
-- welchem Dropbox-Ordner gehoert, und der Zugang zur Dropbox.
-- =============================================================================

-- 1) Welche Dropbox-Ordner gehoeren zu einem Kunden? Meist einer; bei
--    Kunden mit zwei Betrieben unter einem Dach (Schleckofatz/Schmackofatz)
--    auch mehrere.
alter table clients add column if not exists dropbox_ordner text[];

comment on column clients.dropbox_ordner is
  'Dropbox-Pfade des Kunden, z. B. {"/Sow & Loynab Media/01_Kunden/Kebab Kumpels"}.';

-- 2) Der Dropbox-Zugang (Refresh-Token). Nur die Edge Function
--    "dropbox-media" liest ihn mit dem Service-Schluessel. RLS an und
--    keine einzige Policy: aus der App heraus ist die Tabelle unsichtbar.
create table if not exists dropbox_verbindung (
  id            int primary key default 1 check (id = 1),
  refresh_token text not null,
  konto         text,
  verbunden_am  timestamptz not null default now()
);
alter table dropbox_verbindung enable row level security;

-- 3) Bestehende Kunden einmal ihren Ordnern zuordnen. Nur wo noch nichts
--    eingetragen ist -- spaetere Aenderungen von Hand bleiben unangetastet.
update clients set dropbox_ordner = array['/Sow & Loynab Media/01_Kunden/' || name]
 where dropbox_ordner is null and deleted_at is null
   and name in ('BelChicken Essen', 'Fahrschule Hajo', 'Kebab Kumpels');

update clients set dropbox_ordner = array['/Sow & Loynab Media/01_Kunden/Das Licht e.V.']
 where dropbox_ordner is null and deleted_at is null and name = 'Das Licht eV.';

update clients set dropbox_ordner = array['/Sow & Loynab Media/01_Kunden/U-Act Michel']
 where dropbox_ordner is null and deleted_at is null and name = 'Michel Uact';

update clients set dropbox_ordner = array[
    '/Sow & Loynab Media/01_Kunden/Schleckofatz',
    '/Sow & Loynab Media/01_Kunden/Schmackofatz']
 where dropbox_ordner is null and deleted_at is null and name = 'Schleckofatz & Schmackofatz';

update clients set dropbox_ordner = array['/Sow & Loynab Media/02_Eigener Account']
 where dropbox_ordner is null and deleted_at is null and name = 'Sow & Loynab';
