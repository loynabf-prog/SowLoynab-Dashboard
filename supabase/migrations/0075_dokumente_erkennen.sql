-- 0075: Dokumente scannen + automatisch erkennen.
-- Fassie (08.11.2026): "Dokumente scannen, und du schaust dir an, was das ist,
-- und hinterlegst es passend mit Namen -- Briefe zum Gewerbe oder andere Sachen."
-- Die Edge Function "dokument-erkennen" liest jede neue Datei mit Claude,
-- vergibt Titel + Kategorie, fasst den Inhalt zusammen, merkt sich Fristen
-- (-> Aufgabe) und legt Rechnungen zusaetzlich in den Dropbox-Buchhaltungseingang.

alter table dokumente add column if not exists inhalt text;          -- Zusammenfassung + wichtige Nummern (fuer die Suche)
alter table dokumente add column if not exists absender text;
alter table dokumente add column if not exists dokument_datum date;
alter table dokumente add column if not exists frist date;           -- bis wann etwas zu tun ist
alter table dokumente add column if not exists handlung text;        -- was zu tun ist
alter table dokumente add column if not exists betrifft text;        -- 'agentur' | 'fassie' | 'lion'
alter table dokumente add column if not exists erkennung text not null default 'fertig'; -- 'laeuft' | 'fertig' | 'fehler'
alter table dokumente add column if not exists aufgabe_id uuid;
alter table dokumente add column if not exists dropbox_pfad text;
