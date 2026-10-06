-- =============================================================================
-- 0033 — Links automatisch holen + Caption am Video und an der Idee
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0032.
--
-- 1. LINKS AUTOMATISCH. Bisher musste nach jedem Posten die Adresse von Hand
--    nachgetragen werden -- der laestigste Handgriff im Tagesgeschaeft, und
--    der, der am haeufigsten liegen bleibt. Ohne Adresse holt der Nachtlauf
--    nie Zahlen; das Video ist fuer uns unsichtbar.
--
--    Neuer Weg: Beim Klick auf "Gepostet" merken wir uns einen Zeitpunkt ein
--    paar Minuten spaeter. Ein Hintergrundlauf holt dann das NEUESTE Posting
--    des Kunden und haengt es an die Karte. Ein paar Minuten nach dem Posten
--    ist das verlaesslich das richtige -- deshalb die Wartezeit.
--
--    link_fetch_state haelt fest, wie es ausging. 'unklar' heisst: die
--    gefundene Adresse haengt schon an einem anderen Video. Dann fragen wir
--    lieber nach, statt zu raten.
--
-- 2. CAPTION AN DER IDEE. Captions entstehen aus der Videoidee, nicht erst
--    am Posting-Tag. Steht sie schon an der Idee, wandert sie beim
--    Uebernehmen ins Board mit.
--
-- Gefahrlos und wiederholbar.
-- =============================================================================

-- Wann darf der Hintergrundlauf es versuchen? Leer = gar nicht.
alter table videos add column if not exists link_fetch_at    timestamptz;
-- null | 'offen' | 'fertig' | 'unklar' | 'fehlgeschlagen'
alter table videos add column if not exists link_fetch_state text;
alter table videos add column if not exists link_fetch_note  text;
-- Begrenzt die Versuche. Ein dauerhaft privates Profil soll nicht ewig
-- Apify-Guthaben verbrennen.
alter table videos add column if not exists link_fetch_tries integer not null default 0;

-- Der Hintergrundlauf sucht genau danach: faellige, noch offene Abrufe.
create index if not exists idx_videos_link_fetch
  on videos (link_fetch_at)
  where link_fetch_at is not null and deleted_at is null;

alter table video_ideas add column if not exists caption text;
