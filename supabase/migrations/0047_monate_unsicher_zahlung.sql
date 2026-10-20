-- 0047: Monate -- "unsicher" (Fragezeichen), Zahlungsmonat, ausdruecklich "dabei"
-- =============================================================================
--   status 'unsicher'  steht unter Vorbehalt (z. B. Zahlung offen)
--   zahlung_monat      in welchem Monat das Geld voraussichtlich kommt,
--                      wenn es nicht der Leistungsmonat ist
--   dabei              false = in diesem Monat bewusst nicht dabei.
--                      Loest die alte Regel "0 Videos und 0 EUR" ab -- damit
--                      ein Ehrenamt mit 0 EUR trotzdem dabei sein kann.
alter table client_month_plans drop constraint if exists client_month_plans_status_chk;
alter table client_month_plans add constraint client_month_plans_status_chk
  check (status in ('geplant', 'unsicher', 'fest', 'abgeschlossen'));

alter table client_month_plans
  add column if not exists zahlung_monat text,
  add column if not exists dabei boolean not null default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_month_plans_zahlung_chk') then
    alter table client_month_plans add constraint client_month_plans_zahlung_chk
      check (zahlung_monat is null or zahlung_monat ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

-- Alte "nicht dabei"-Eintraege (0 Videos, 0 EUR) umstellen
update client_month_plans set dabei = false where quota = 0 and coalesce(betrag, 0) = 0;
