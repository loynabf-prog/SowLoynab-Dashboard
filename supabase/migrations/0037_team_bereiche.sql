-- =============================================================================
-- 0037 — Bereiche pro Team-Mitglied
-- =============================================================================
-- Reihenfolge nach 0036. Gefahrlos und wiederholbar.
--
-- Welche Bereiche (Posting, Produktion, Analyse, ...) ein Mitglied in der
-- Navigation sieht. Leer/NULL heisst "sieht alles" -- der Normalfall fuer
-- die Gruender. Die Schluessel stehen in src/lib/bereiche.ts.
-- =============================================================================

alter table team_members add column if not exists bereiche text[];

comment on column team_members.bereiche is
  'Sichtbare Bereiche in der Navigation (lib/bereiche.ts). NULL = alle.';
