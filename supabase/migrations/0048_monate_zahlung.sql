-- 0048: Monate -- ist das Geld schon da?
--   zahlstatus  offen | rechnung (Rechnung ist raus) | bezahlt
--   bezahlt_am  Datum des Zahlungseingangs
alter table client_month_plans
  add column if not exists zahlstatus text not null default 'offen',
  add column if not exists bezahlt_am date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_month_plans_zahlstatus_chk') then
    alter table client_month_plans add constraint client_month_plans_zahlstatus_chk
      check (zahlstatus in ('offen', 'rechnung', 'bezahlt'));
  end if;
end $$;
