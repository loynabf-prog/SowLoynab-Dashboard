-- 0046: In Monaten planen
-- =============================================================================
-- Bisher galt fuer jeden Kunden ein fester Retainer (monthly_quota /
-- monthly_fee), Abweichungen nur als Videozahl. Jetzt bekommt jeder Monat
-- je Kunde einen eigenen Eintrag: Videos, Betrag, Stand.
--
--   geplant        so sieht es aus, kann sich noch aendern
--   fest           steht, ist zugesagt
--   abgeschlossen  Monat ist durch, Zahlen sind eingefroren
--
-- Ein Eintrag mit 0 Videos und 0 EUR heisst "in diesem Monat nicht dabei".
-- Ohne Eintrag schlaegt die App fuer aktuelle und kommende Monate den
-- Retainer vor -- vergangene Monate zaehlen nur mit Eintrag.
--
-- Videos koennen einem anderen Monat zugerechnet werden, als sie gepostet
-- werden (z. B. ein November-Video, das schon im Oktober rausgeht):
-- videos.abrechnungsmonat. Leer = Monat des Posting-Tags.
-- Rein additiv.

alter table client_month_plans
  add column if not exists betrag numeric(10,2),
  add column if not exists status text not null default 'geplant',
  add column if not exists notiz  text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_month_plans_status_chk') then
    alter table client_month_plans add constraint client_month_plans_status_chk
      check (status in ('geplant', 'fest', 'abgeschlossen'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_month_plans_key_chk') then
    alter table client_month_plans add constraint client_month_plans_key_chk
      check (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

alter table videos add column if not exists abrechnungsmonat text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'videos_abrechnungsmonat_chk') then
    alter table videos add constraint videos_abrechnungsmonat_chk
      check (abrechnungsmonat is null or abrechnungsmonat ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

-- Bestehende Ausnahmen bekommen den Betrag des Retainers, damit nichts leer ist.
update client_month_plans p
   set betrag = c.monthly_fee
  from clients c
 where c.id = p.client_id and p.betrag is null;
