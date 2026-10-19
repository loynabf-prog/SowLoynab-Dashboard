-- 0042: Nach "Gepostet" sofort die Links holen statt nach 5 Minuten.
-- Gleiche Funktion wie 0040, nur link_fetch_at = now(). Der Cron (alle 5 Min)
-- greift das Video damit beim naechsten Lauf; die App ruft zusaetzlich direkt.

create or replace function public.videos_status_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  status_neu  boolean;
  haken_neu   boolean;
begin
  new.prep_shot      := coalesce(new.prep_shot, false);
  new.prep_edited    := coalesce(new.prep_edited, false);
  new.prep_scheduled := coalesce(new.prep_scheduled, false);

  if tg_op = 'INSERT' then
    status_neu := new.status <> 'todo';
    haken_neu  := new.prep_shot or new.prep_edited or new.prep_scheduled;
  else
    status_neu := new.status is distinct from old.status;
    haken_neu  := (new.prep_shot, new.prep_edited, new.prep_scheduled)
                  is distinct from (old.prep_shot, old.prep_edited, old.prep_scheduled);
  end if;

  if status_neu and not haken_neu then
    -- Karte wurde verschoben: Haekchen folgen dem Status.
    if new.status in ('posted', 'planned') then
      new.prep_shot := true; new.prep_edited := true; new.prep_scheduled := true;
    elsif new.status = 'ready' then
      new.prep_shot := true; new.prep_edited := true; new.prep_scheduled := false;
    elsif new.status = 'todo' then
      new.prep_edited := false; new.prep_scheduled := false;
    end if;

  elsif haken_neu then
    -- Weggenommen: spaetere Schritte fallen mit.
    if tg_op = 'UPDATE' then
      if old.prep_shot and not new.prep_shot then
        new.prep_edited := false; new.prep_scheduled := false;
      end if;
      if old.prep_edited and not new.prep_edited then
        new.prep_scheduled := false;
      end if;
    end if;
    -- Gesetzt: fruehere Schritte kommen mit.
    if new.prep_scheduled then new.prep_edited := true; end if;
    if new.prep_edited then new.prep_shot := true; end if;
    -- Status folgt -- ein gepostetes Video bleibt gepostet.
    if new.status <> 'posted' then
      new.status := case
        when new.prep_scheduled then 'planned'::video_status
        when new.prep_edited    then 'ready'::video_status
        else 'todo'::video_status
      end;
    else
      new.prep_shot := true; new.prep_edited := true; new.prep_scheduled := true;
    end if;
  end if;

  -- Frisch auf "Gepostet" gestellt (nicht beim Nachtragen alter Videos per
  -- INSERT -- da waere "das neueste Posting" das falsche).
  if tg_op = 'UPDATE' and new.status = 'posted' and old.status is distinct from 'posted' then
    new.posted_at := coalesce(new.posted_at, now());
    if new.link_fetch_at is null
       and (coalesce(new.tiktok_url, '') = '' or coalesce(new.instagram_url, '') = '')
       and coalesce(new.link_fetch_state, '') not in ('fertig') then
      new.link_fetch_at    := now();
      new.link_fetch_state := 'offen';
      new.link_fetch_tries := 0;
    end if;
  end if;

  return new;
end;
$$;
