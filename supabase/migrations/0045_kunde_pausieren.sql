-- 0045: Kunden pausieren
-- =============================================================================
-- Manchmal geht bei einem Kunden einfach nichts: wir warten auf den Chef,
-- koennen nicht hinfahren, nicht drehen. Dann sollen seine Videos und
-- Drehtage nicht mehr auf "Heute", im Plan und in der Morgen-Nachricht
-- auftauchen -- in der Produktion und in der Kundenakte aber weiter da sein.
--
-- Pausiert ist ein Kunde, solange pausiert_seit gesetzt ist. Fortsetzen =
-- auf null setzen. Rein additiv.

alter table clients
  add column if not exists pausiert_seit date,
  add column if not exists pause_grund   text;

comment on column clients.pausiert_seit is 'Gesetzt = Kunde pausiert (nicht auf Heute/Plan/Morgen-Push). null = laeuft.';
