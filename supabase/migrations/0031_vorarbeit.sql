-- =============================================================================
-- 0031 — Vorarbeit: gedreht, geschnitten, eingeplant
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0030.
--
-- Ein Video ist nicht erst am Tag des Postings Arbeit. Gedreht und
-- geschnitten wird vorher -- oft einen Tag vorher, manchmal mehrere.
-- Bisher kannte die App nur "noch nicht gepostet" und "gepostet"; wie weit
-- ein Video davor schon ist, stand nirgends.
--
-- Drei Haekchen, in der Reihenfolge, in der gearbeitet wird. Bewusst
-- getrennt vom Status: der Status sagt, wo die Karte im Board liegt, diese
-- drei sagen, was am Video schon getan ist.
--
-- Gefahrlos und wiederholbar.
-- =============================================================================

alter table videos add column if not exists prep_shot      boolean not null default false;
alter table videos add column if not exists prep_edited    boolean not null default false;
alter table videos add column if not exists prep_scheduled boolean not null default false;

-- Was schon gepostet ist, war zwangslaeufig gedreht, geschnitten und
-- eingeplant. Einmal nachtragen, damit alte Videos nicht als unfertig
-- dastehen.
update videos
   set prep_shot = true, prep_edited = true, prep_scheduled = true
 where status = 'posted'
   and (prep_shot = false or prep_edited = false or prep_scheduled = false);
