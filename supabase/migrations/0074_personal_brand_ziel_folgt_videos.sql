-- Personal Brand (client_type 'eigen') genauso wie Referenz-Kunden:
-- keine feste Videozahl, Monatsziel = angelegte Videos des Monats.
create or replace function public.referenz_monatsziel_sync(p_client uuid, p_monat text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_client is null or p_monat is null then return; end if;
  if p_monat < to_char(now() at time zone 'Europe/Berlin','YYYY-MM') then return; end if;
  if not exists (select 1 from clients where id = p_client and client_type in ('referenz','eigen')) then return; end if;
  select count(*) into n from videos v
   where v.client_id = p_client and v.deleted_at is null
     and coalesce(v.abrechnungsmonat, left(v.scheduled_date::text,7),
                  to_char(v.posted_at at time zone 'Europe/Berlin','YYYY-MM')) = p_monat;
  insert into client_month_plans (client_id, month_key, quota, betrag, status, dabei, zahlstatus, notiz)
  values (p_client, p_monat, n, 0, 'fest', n > 0, 'offen', 'Ohne feste Zahl – Ziel = angelegte Videos.')
  on conflict (client_id, month_key) do update set quota = excluded.quota, dabei = excluded.quota > 0 or client_month_plans.dabei, updated_at = now();
end $$;

select referenz_monatsziel_sync(x.client_id, x.m) from (
  select distinct v.client_id, coalesce(v.abrechnungsmonat, left(v.scheduled_date::text,7), to_char(v.posted_at at time zone 'Europe/Berlin','YYYY-MM')) m
  from videos v join clients c on c.id = v.client_id
  where c.client_type = 'eigen' and v.deleted_at is null) x
where x.m is not null;
