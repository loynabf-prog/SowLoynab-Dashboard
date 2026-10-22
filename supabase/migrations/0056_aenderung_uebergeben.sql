-- Aenderungswunsch, der zusammen mit der Freigabe an Lion geht (wird auf dem Mac umgesetzt,
-- die PC-Automatik ignoriert ihn).
alter table video_aenderungen drop constraint if exists video_aenderungen_status_check;
alter table video_aenderungen add constraint video_aenderungen_status_check
  check (status in ('offen', 'laeuft', 'erledigt', 'fehler', 'uebergeben'));
comment on column video_aenderungen.status is 'offen -> laeuft -> erledigt | fehler; uebergeben = Wunsch geht mit der Freigabe an Lion und wird auf dem Mac umgesetzt (PC-Automatik ignoriert ihn)';
