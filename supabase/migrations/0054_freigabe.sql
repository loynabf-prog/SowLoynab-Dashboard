-- =============================================================================
-- 0054 — Freigabe durch Fassie, bevor ein Video zu Lion geht
-- =============================================================================
-- Kette (Dropbox):
--   2 Im Schnitt/<Kunde> - <Idee>   Claude schneidet  -> produktion_stufe 'pruefung'
--        |  Fassie schaut die Vorschau im CRM an
--        |-- "Aendern"   -> Wunsch in video_aenderungen (Warteschlange, streng
--        |                  nacheinander abgearbeitet), danach wieder 'pruefung'
--        '-- "Freigeben" -> Ordner nach 3 Feinschliff, 'feinschliff', Aufgabe an Lion
-- =============================================================================

alter table videos drop constraint if exists videos_produktion_stufe_check;
alter table videos add constraint videos_produktion_stufe_check
  check (produktion_stufe in ('roh', 'pruefung', 'feinschliff', 'fertig'));

alter table videos add column if not exists freigegeben_am timestamptz;
alter table videos add column if not exists freigegeben_von uuid references team_members (id) on delete set null;

-- Aenderungswuensche: eine Zeile pro Runde. Die Automatik nimmt immer den
-- aeltesten offenen Wunsch und arbeitet nie zwei gleichzeitig ab.
create table if not exists video_aenderungen (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos (id) on delete cascade,
  client_id   uuid references clients (id) on delete set null,
  wunsch      text not null check (length(trim(wunsch)) > 0),
  status      text not null default 'offen' check (status in ('offen', 'laeuft', 'erledigt', 'fehler')),
  notiz       text,                         -- was Claude geaendert hat / warum es haengt
  created_by  uuid references team_members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  erledigt_am timestamptz,
  deleted_at  timestamptz
);
create index if not exists idx_video_aenderungen_offen on video_aenderungen (status, created_at) where deleted_at is null;
create index if not exists idx_video_aenderungen_video on video_aenderungen (video_id, created_at desc);

create or replace trigger trg_video_aenderungen_touch before update on video_aenderungen
  for each row execute function produktion_touch();

alter table video_aenderungen enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_aenderungen' and policyname = 'team_all_video_aenderungen') then
    create policy "team_all_video_aenderungen" on video_aenderungen for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'video_aenderungen') then
    alter publication supabase_realtime add table video_aenderungen;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'videos') then
    alter publication supabase_realtime add table videos;
  end if;
end$$;

-- Freigabe in einem Rutsch: Video umstellen, Aufgabe fuer Lion, Karte im Team-Kanal.
-- Den Ordner in Dropbox verschiebt vorher die App (dropbox-media, move).
create or replace function video_freigeben(p_video uuid, p_neuer_pfad text, p_von uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v       videos%rowtype;
  kunde   text;
  lion    uuid;
  kanal   uuid;
  aufgabe uuid;
begin
  select * into v from videos where id = p_video and deleted_at is null;
  if not found then raise exception 'Video nicht gefunden'; end if;
  if v.produktion_stufe is distinct from 'pruefung' then raise exception 'Video wartet nicht auf Freigabe'; end if;

  select name into kunde from clients where id = v.client_id;
  select id into lion from team_members where name ilike 'Lion%' and coalesce(active, true) order by created_at limit 1;
  select id into kanal from chat_channels where kind = 'team' and deleted_at is null order by created_at limit 1;

  update videos
     set produktion_stufe = 'feinschliff', dropbox_pfad = p_neuer_pfad,
         freigegeben_am = now(), freigegeben_von = p_von
   where id = p_video;

  insert into tasks (title, client_id, notes, assignee_ids, created_by, priority)
  values (
    'Feinschliff: ' || coalesce(kunde, 'Kunde') || ' – ' || v.title,
    v.client_id,
    'Dropbox: ' || regexp_replace(p_neuer_pfad, '^/Sow & Loynab Media/', '') || E'\n'
      || 'Von Fassie freigegeben. ' || v.title || '.prproj öffnen, Clips in Medien/Clips, offene Punkte in NOTIZEN.md.' || E'\n'
      || 'Export nach 4 Fertig/' || regexp_replace(p_neuer_pfad, '^.*/', '') || '.mp4 (genau der Ordnername).',
    case when lion is null then null else array[lion] end,
    auth.uid(),
    1
  )
  returning id into aufgabe;

  if kanal is not null then
    insert into chat_messages (channel_id, author_kind, body, task_id)
    values (kanal, 'system', '✅ Freigegeben: ' || v.title || ' (' || coalesce(kunde, 'Kunde') || ') – liegt jetzt in 3 Feinschliff.', aufgabe);
  end if;

  return aufgabe;
end$$;
