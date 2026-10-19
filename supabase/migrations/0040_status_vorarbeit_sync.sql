-- =============================================================================
-- 0040 — Board-Status und Vorarbeit-Haekchen immer gleich
-- =============================================================================
-- Reihenfolge nach 0039. Gefahrlos und wiederholbar.
--
-- Zweite Sicherung: die App schreibt schon nach derselben Regel
-- (src/lib/statusSync.ts). Der Trigger greift auch, wenn ein Skript oder
-- Claude direkt in die Datenbank schreibt.
--
-- Bisher gab es zwei Wahrheiten fuer denselben Stand:
--   * der Board-Status (Zu bearbeiten / Bereit / Geplant / Gepostet), den man
--     in der Kundenakte per Ziehen setzt
--   * die drei Haekchen gedreht / geschnitten / eingeplant auf der Startseite
--     und im Posting-Bereich
-- Wer eine Karte nach "Geplant" zog, hatte danach keinen Haken; wer "Eingeplant"
-- abhakte, liess die Karte in "Zu bearbeiten" liegen. Und wer per Board auf
-- "Gepostet" zog, bekam keine automatische Link-Abholung.
--
-- Jetzt haelt die Datenbank beides zusammen -- egal, welcher Bildschirm,
-- welches Skript oder Claude gerade schreibt:
--
--   Status geaendert   -> Haekchen folgen
--      posted / planned -> alle drei an
--      ready            -> gedreht + geschnitten an, eingeplant aus
--      todo             -> geschnitten + eingeplant aus (gedreht bleibt)
--   Haekchen geaendert -> Status folgt (ausser bei bereits Gepostetem)
--      eingeplant -> planned, geschnitten -> ready, sonst todo
--      Spaeterer Schritt schliesst frueheren ein; wird ein frueherer
--      Schritt weggenommen, fallen die spaeteren mit.
--   Uebers Board auf "Gepostet" -> posted_at setzen und, wenn Links fehlen,
--      die automatische Link-Abholung in 5 Minuten anstossen.
-- =============================================================================

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
      new.link_fetch_at    := now() + interval '5 minutes';
      new.link_fetch_state := 'offen';
      new.link_fetch_tries := 0;
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger trg_videos_status_sync
  before insert or update on public.videos
  for each row execute function public.videos_status_sync();

-- Einmal geraderuecken, was schon auseinanderlief: der Status gilt.
update public.videos set prep_shot = true, prep_edited = true
 where deleted_at is null and status = 'ready' and not (prep_shot and prep_edited);
update public.videos set prep_shot = true, prep_edited = true, prep_scheduled = true
 where deleted_at is null and status in ('planned', 'posted')
   and not (prep_shot and prep_edited and prep_scheduled);
