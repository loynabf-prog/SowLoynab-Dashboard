-- =============================================================================
-- 0062 — Jeder schneidet seine eigenen Kunden komplett (Entscheidung 27.10.2026)
-- =============================================================================
-- Vorher: Claude schneidet -> Fassie gibt frei -> Lion macht Feinschliff.
-- Jetzt:  Fassie und Lion haben je eigene Kunden und schneiden deren Videos mit
--         Claude von Anfang bis Ende. Wer fertig ist, gibt direkt zum Posten
--         frei. Nur bei Problemen geht ein Video an den anderen.
--
--   clients.zustaendig_id   wer die Videos dieses Kunden schneidet
--   videos.bearbeiter_id    nur gesetzt, wenn ein Video weitergegeben wurde
--   video_fertig()          2 Im Schnitt -> 4 Fertig, Stufe 'fertig', bereit zum Posten
--   video_weitergeben()     Video an den anderen, mit Aufgabe + Chat-Karte
-- Additiv und wiederholbar.
-- =============================================================================

alter table clients add column if not exists zustaendig_id uuid references team_members (id) on delete set null;
alter table videos  add column if not exists bearbeiter_id uuid references team_members (id) on delete set null;
create index if not exists idx_clients_zustaendig on clients (zustaendig_id);
create index if not exists idx_videos_bearbeiter on videos (bearbeiter_id) where bearbeiter_id is not null;

-- Fertig geschnitten: bereit zum Posten. Den Ordner verschiebt vorher die App.
create or replace function video_fertig(p_video uuid, p_neuer_pfad text, p_von uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v     videos%rowtype;
  kunde text;
  kanal uuid;
begin
  select * into v from videos where id = p_video and deleted_at is null;
  if not found then raise exception 'Video nicht gefunden'; end if;

  select name into kunde from clients where id = v.client_id;
  select id into kanal from chat_channels where kind = 'team' and deleted_at is null order by created_at limit 1;

  update videos
     set produktion_stufe = 'fertig',
         dropbox_pfad     = coalesce(p_neuer_pfad, dropbox_pfad),
         status           = case when status in ('planned', 'posted') then status else 'ready' end,
         prep_shot = true, prep_edited = true,
         freigegeben_am = now(), freigegeben_von = p_von,
         bearbeiter_id = null
   where id = p_video;

  if kanal is not null then
    insert into chat_messages (channel_id, author_kind, body)
    values (kanal, 'system', '✅ Fertig: ' || v.title || ' (' || coalesce(kunde, 'Kunde') || ') – bereit zum Posten.');
  end if;
end$$;

-- Weitergeben, wenn man selbst nicht weiterkommt: Bearbeiter umstellen,
-- Aufgabe fuer den anderen, Karte im Team-Kanal.
create or replace function video_weitergeben(p_video uuid, p_an uuid, p_von uuid, p_notiz text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v       videos%rowtype;
  kunde   text;
  an_name text;
  kanal   uuid;
  aufgabe uuid;
begin
  select * into v from videos where id = p_video and deleted_at is null;
  if not found then raise exception 'Video nicht gefunden'; end if;
  select name into kunde from clients where id = v.client_id;
  select name into an_name from team_members where id = p_an;
  select id into kanal from chat_channels where kind = 'team' and deleted_at is null order by created_at limit 1;

  update videos set bearbeiter_id = p_an where id = p_video;

  insert into tasks (title, client_id, notes, assignee_ids, created_by, priority)
  values ('Schnitt übernehmen: ' || coalesce(kunde, 'Kunde') || ' – ' || v.title, v.client_id,
          nullif(trim(coalesce(p_notiz, '')), ''), array[p_an], auth.uid(), 2)
  returning id into aufgabe;

  if kanal is not null then
    insert into chat_messages (channel_id, author_kind, body, task_id)
    values (kanal, 'system', '↪ ' || v.title || ' (' || coalesce(kunde, 'Kunde') || ') geht an ' || coalesce(an_name, 'dich')
            || coalesce(' – ' || nullif(trim(p_notiz), ''), ''), aufgabe);
  end if;
  return aufgabe;
end$$;
