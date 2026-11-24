-- 0087: Upload-Kalender -- Spiegel der Metricool-Planung (eingespielt 24.11.2026)
alter table public.clients add column if not exists metricool_brand_id text;

create table if not exists public.uploads (
  metricool_id text primary key,
  client_id uuid references public.clients(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  datum date not null,
  uhrzeit time,
  plattformen text[] not null default '{}',
  status text not null default 'geplant' check (status in ('geplant','veroeffentlicht','fehler','entwurf')),
  hat_caption boolean not null default false,
  titel text,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists uploads_datum_idx on public.uploads(datum) where deleted_at is null;
alter table public.uploads enable row level security;
drop policy if exists team_all_uploads on public.uploads;
create policy team_all_uploads on public.uploads for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.upload_melden(
  p_metricool_id text, p_brand text, p_datum date, p_uhrzeit time, p_plattformen text[],
  p_status text, p_hat_caption boolean, p_titel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare k uuid; v uuid;
begin
  select id into k from public.clients where metricool_brand_id = p_brand and deleted_at is null limit 1;
  if k is null then return null; end if;
  select video_id into v from public.uploads where metricool_id = p_metricool_id;
  if v is null then
    select id into v from public.videos
     where client_id = k and deleted_at is null and scheduled_date = p_datum
       and id not in (select video_id from public.uploads where video_id is not null and metricool_id <> p_metricool_id)
     order by (status = 'posted') desc, prep_edited desc, scheduled_time nulls last limit 1;
  end if;
  insert into public.uploads (metricool_id, client_id, video_id, datum, uhrzeit, plattformen, status, hat_caption, titel, synced_at, deleted_at)
  values (p_metricool_id, k, v, p_datum, p_uhrzeit, p_plattformen, p_status, p_hat_caption, p_titel, now(), null)
  on conflict (metricool_id) do update set client_id = excluded.client_id, video_id = coalesce(public.uploads.video_id, excluded.video_id),
    datum = excluded.datum, uhrzeit = excluded.uhrzeit, plattformen = excluded.plattformen, status = excluded.status,
    hat_caption = excluded.hat_caption, titel = excluded.titel, synced_at = now(), deleted_at = null;
  if v is not null then
    update public.videos set prep_shot = true, prep_edited = true, prep_scheduled = true,
           status = case when status = 'posted' then status else 'planned' end,
           scheduled_time = coalesce(scheduled_time, p_uhrzeit)
     where id = v;
  end if;
  return v;
end $$;

create or replace function public.uploads_abgleich_fertig(p_brand text, p_von date, p_bis date, p_gesehen text[])
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.uploads u set deleted_at = now()
   where u.client_id = (select id from public.clients where metricool_brand_id = p_brand limit 1)
     and u.datum between p_von and p_bis and u.status = 'geplant' and u.deleted_at is null
     and not (u.metricool_id = any(p_gesehen));
  get diagnostics n = row_count;
  insert into public.system_status (job, last_ok, detail, updated_at)
  values ('metricool-sync', now(), 'Abgleich bis ' || to_char(p_bis, 'DD.MM.'), now())
  on conflict (job) do update set last_ok = now(), detail = excluded.detail, updated_at = now();
  return n;
end $$;

revoke all on function public.upload_melden(text, text, date, time, text[], text, boolean, text) from anon;
revoke all on function public.uploads_abgleich_fertig(text, date, date, text[]) from anon;

create or replace view public.upload_tage with (security_invoker = true) as
with soll as (
  select v.client_id, v.scheduled_date as datum, v.status::text as status,
         (v.prep_scheduled or exists (select 1 from public.uploads u where u.video_id = v.id and u.deleted_at is null)) as eingeplant
    from public.videos v
   where v.deleted_at is null and v.scheduled_date is not null
), extra as (
  select u.client_id, u.datum, 'planned'::text as status, true as eingeplant
    from public.uploads u where u.deleted_at is null and u.video_id is null
)
select client_id, datum, count(*) as videos,
       count(*) filter (where status = 'posted' or eingeplant) as fertig,
       count(*) filter (where status <> 'posted' and not eingeplant) as offen
  from (select * from soll union all select * from extra) x
 group by client_id, datum;
