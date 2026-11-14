-- 0078 (14.11.2026): Wird ein Video als bereits gepostet NEU angelegt (Abgleich,
-- Gepostet-Knopf, Claude-Chat), faellt ein leerer Platzhalter ("November 7")
-- desselben Kunden und Monats weg -- sonst zaehlt der Monat doppelt.
create or replace function public.ist_leerer_platzhalter(v public.videos) returns boolean
language sql immutable as $$
  select v.status <> 'posted'
     and v.title ~ '^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d+$'
     and not coalesce(v.prep_shot, false)
     and coalesce(v.script, '') = ''
     and v.produktion_stufe is null
$$;

create or replace function public.platzhalter_verbrauchen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  monate text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  tag date := coalesce((new.posted_at at time zone 'Europe/Berlin')::date, new.scheduled_date, (now() at time zone 'Europe/Berlin')::date);
  monatsname text := monate[extract(month from tag)::int];
  ziel uuid;
begin
  if new.status <> 'posted' or new.deleted_at is not null then return new; end if;
  if new.title ~ '^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d+$' then return new; end if;
  select v.id into ziel from public.videos v
   where v.client_id = new.client_id and v.id <> new.id and v.deleted_at is null
     and public.ist_leerer_platzhalter(v)
     and (v.channel_id is null or new.channel_id is null or v.channel_id = new.channel_id)
     and ( (v.scheduled_date is not null and date_trunc('month', v.scheduled_date) = date_trunc('month', tag))
        or (v.scheduled_date is null and split_part(v.title, ' ', 1) = monatsname) )
   order by v.scheduled_date nulls last, (substring(v.title from '\d+$'))::int desc
   limit 1;
  if ziel is not null then
    update public.videos set deleted_at = now(),
      notes = trim(both from coalesce(notes, '') || ' Automatisch entfernt: ersetzt durch gepostetes Video „' || coalesce(new.title, '') || '“')
    where id = ziel;
  end if;
  return new;
end $$;

drop trigger if exists videos_platzhalter_verbrauchen on public.videos;
create trigger videos_platzhalter_verbrauchen after insert on public.videos
  for each row execute function public.platzhalter_verbrauchen();
