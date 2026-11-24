-- 0085: Zahlstatus der Monatsplaene kommt nur noch aus Lexware (ueber invoices).
-- Lexware wird tagsueber stuendlich + nachts abgeglichen. In der App gibt es keine
-- Handknoepfe mehr fuer Rechnungs-/Zahlstatus. (eingespielt am 24.11.2026)

create or replace function public.monate_aus_lexware(p_invoice uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; von date; bis date; n int := 0; k int;
begin
  for r in
    select i.* from public.invoices i
     where i.client_id is not null and i.lexware_id is not null
       and coalesce(i.lexware_status, i.status) <> 'voided'
       and (p_invoice is null or i.id = p_invoice)
  loop
    von := null; bis := null;
    begin
      von := to_date(substring(r.service_period from '^\s*(\d{2}\.\d{2}\.\d{4})'), 'DD.MM.YYYY');
      bis := to_date(substring(r.service_period from '(\d{2}\.\d{2}\.\d{4})\s*$'), 'DD.MM.YYYY');
    exception when others then von := null; bis := null;
    end;
    if von is null then von := coalesce(r.issued_on, current_date); end if;
    if bis is null or bis < von then bis := von; end if;

    update public.client_month_plans m
       set zahlstatus = case when coalesce(r.lexware_status, r.status) = 'paid' then 'bezahlt' else 'rechnung' end,
           bezahlt_am = case when coalesce(r.lexware_status, r.status) = 'paid' then coalesce(r.paid_on, current_date) else null end,
           updated_at = now()
     where m.client_id = r.client_id
       and m.month_key between to_char(von, 'YYYY-MM') and to_char(bis, 'YYYY-MM')
       and (m.zahlstatus is distinct from case when coalesce(r.lexware_status, r.status) = 'paid' then 'bezahlt' else 'rechnung' end
            or m.bezahlt_am is distinct from case when coalesce(r.lexware_status, r.status) = 'paid' then coalesce(r.paid_on, current_date) else null end);
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

create or replace function public.invoices_monate_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.monate_aus_lexware(new.id);
  return new;
end $$;

drop trigger if exists invoices_monate_sync on public.invoices;
create trigger invoices_monate_sync after insert or update of status, lexware_status, paid_on, service_period, client_id
  on public.invoices for each row execute function public.invoices_monate_trigger();

create or replace function public.monatsplan_neu_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare i uuid;
begin
  for i in select id from public.invoices where client_id = new.client_id and lexware_id is not null loop
    perform public.monate_aus_lexware(i);
  end loop;
  return null;
end $$;

drop trigger if exists monatsplan_neu_lexware on public.client_month_plans;
create trigger monatsplan_neu_lexware after insert on public.client_month_plans
  for each row execute function public.monatsplan_neu_trigger();

revoke all on function public.monate_aus_lexware(uuid) from anon;

select cron.unschedule('lexware-sync-tag') where exists (select 1 from cron.job where jobname = 'lexware-sync-tag');
select cron.schedule('lexware-sync-tag', '5 6-21 * * *', 'select claude.lexware_sync_start()');

select public.monate_aus_lexware();
