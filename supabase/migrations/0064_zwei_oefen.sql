-- =============================================================================
-- 0064 — Zwei Öfen: jeder backt seine eigenen Kunden (Fassie, 28.10.2026)
-- =============================================================================
-- Bisher (0063) gab es EINE Schlange, immer nur ein Auftrag gleichzeitig.
-- Jetzt hat jeder Zuständige seinen eigenen Ofen (Fassies PC, Lions MacBook,
-- später ein Mac mini). Beide backen gleichzeitig.
--
--   video_aenderungen.ofen_id     wessen Ofen (team_members.id) – wird beim
--                                 Einreihen automatisch gesetzt:
--                                 weitergegeben (videos.bearbeiter_id) >
--                                 zuständig für den Kunden (clients.zustaendig_id)
--   video_aenderungen.fortschritt 0–100, meldet der Bäcker (Automatik)
--   video_aenderungen.schritt     z. B. "Transkript", "Schnitt", "Untertitel", "Export"
--
--   schlange_naechster(p_ofen)    nächster Auftrag für genau diesen Ofen
--                                 (ohne Angabe: irgendein Ofen, der gerade frei ist)
--   schlange_nach_vorne(id)       vordrängeln – innerhalb des eigenen Ofens
--   schlange_nach_hinten(id)      hinten anstellen – innerhalb des eigenen Ofens
--   ofen_melden(id, %, schritt)   Fortschritt aus der Automatik
--
-- Kommt eine Pizza raus (laeuft -> erledigt/fehler), bekommt NUR der Besitzer
-- des Ofens einen Push.
-- Additiv und wiederholbar.
-- =============================================================================

alter table video_aenderungen add column if not exists ofen_id uuid references team_members (id) on delete set null;
alter table video_aenderungen add column if not exists fortschritt smallint;
alter table video_aenderungen add column if not exists schritt text;
create index if not exists idx_video_aenderungen_ofen on video_aenderungen (ofen_id, reihenfolge) where status in ('offen', 'laeuft') and deleted_at is null;

comment on column video_aenderungen.ofen_id is 'Wessen Ofen backt diesen Auftrag (team_members.id): weitergegeben > zuständig für den Kunden';
comment on column video_aenderungen.fortschritt is '0–100, meldet die Schnitt-Automatik über ofen_melden()';
comment on column video_aenderungen.schritt is 'Aktueller Schritt im Ofen, z. B. Transkript, Schnitt, Untertitel, Export';

-- Wessen Ofen ist für ein Video zuständig?
create or replace function ofen_von_video(p_video uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select coalesce(v.bearbeiter_id, c.zustaendig_id)
    from videos v left join clients c on c.id = v.client_id
   where v.id = p_video;
$$;

-- Beim Einreihen den Ofen automatisch setzen, ans Ende der eigenen Schlange.
create or replace function video_aenderungen_ofen_setzen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ofen_id is null then
    new.ofen_id := ofen_von_video(new.video_id);
  end if;
  return new;
end$$;

drop trigger if exists trg_video_aenderungen_ofen on video_aenderungen;
create trigger trg_video_aenderungen_ofen
  before insert on video_aenderungen
  for each row execute function video_aenderungen_ofen_setzen();

-- Bestehende Aufträge nachziehen
update video_aenderungen set ofen_id = ofen_von_video(video_id)
 where ofen_id is null and deleted_at is null;

-- Nächster Auftrag: pro Ofen immer nur einer gleichzeitig.
drop function if exists schlange_naechster();
create or replace function schlange_naechster(p_ofen uuid default null)
returns setof video_aenderungen
language plpgsql
set search_path = public
as $$
declare
  n uuid;
begin
  select a.id into n from video_aenderungen a
   where a.status = 'offen' and a.deleted_at is null
     and (p_ofen is null or a.ofen_id = p_ofen)
     -- dieser Ofen ist gerade frei
     and not exists (select 1 from video_aenderungen b
                      where b.status = 'laeuft' and b.deleted_at is null
                        and b.ofen_id is not distinct from a.ofen_id
                        and b.updated_at > now() - interval '3 hours')
   order by a.reihenfolge nulls last, a.created_at
   limit 1
   for update skip locked;
  if n is null then return; end if;
  return query
    update video_aenderungen
       set status = 'laeuft', gestartet_am = now(), fortschritt = 0, schritt = 'Vorbereiten'
     where id = n returning *;
end$$;

-- Vordrängeln: vor alle Wartenden im selben Ofen
create or replace function schlange_nach_vorne(p_id uuid)
returns void
language sql
set search_path = public
as $$
  update video_aenderungen a
     set reihenfolge = coalesce((select min(b.reihenfolge) from video_aenderungen b
                                  where b.status = 'offen' and b.deleted_at is null and b.id <> p_id
                                    and b.ofen_id is not distinct from a.ofen_id), extract(epoch from now())) - 1
   where a.id = p_id and a.status = 'offen';
$$;

-- Hinten anstellen: hinter alle Wartenden im selben Ofen
create or replace function schlange_nach_hinten(p_id uuid)
returns void
language sql
set search_path = public
as $$
  update video_aenderungen a
     set reihenfolge = greatest(coalesce((select max(b.reihenfolge) from video_aenderungen b
                                  where b.status = 'offen' and b.deleted_at is null and b.id <> p_id
                                    and b.ofen_id is not distinct from a.ofen_id), 0) + 1, extract(epoch from now()))
   where a.id = p_id and a.status = 'offen';
$$;

-- Fortschritt aus der Automatik
create or replace function ofen_melden(p_id uuid, p_fortschritt int, p_schritt text default null)
returns void
language sql
set search_path = public
as $$
  update video_aenderungen
     set fortschritt = least(100, greatest(0, p_fortschritt)),
         schritt = coalesce(p_schritt, schritt)
   where id = p_id and status = 'laeuft';
$$;

-- Push an den Besitzer, wenn eine Pizza aus dem Ofen kommt
create or replace function ofen_raus_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  titel text;
  kunde text;
begin
  if old.status = 'laeuft' and new.status in ('erledigt', 'fehler') and new.ofen_id is not null then
    select v.title, c.name into titel, kunde
      from videos v left join clients c on c.id = v.client_id where v.id = new.video_id;
    perform net.http_post(
      url     := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmJleWVjc2R2ZWpodnh0cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDcxODgsImV4cCI6MjEwMjYyMzE4OH0.mtMuMDr0xpnqx-csEx199Q3A8DbymN7mqicRqHelKZk'),
      body    := jsonb_build_object(
                   'member_id', new.ofen_id,
                   'title', case when new.status = 'erledigt' then '🍕 Raus aus dem Ofen' else '🔥 Pizza angebrannt' end,
                   'body', coalesce(titel, 'Video') || ' (' || coalesce(kunde, 'Kunde') || ')'
                           || case when new.status = 'erledigt' then ' – anschauen: servieren oder zurück in den Ofen?'
                                   else ' – der Schnitt ist hängen geblieben.' end,
                   'link', '/ofen',
                   'tag', 'ofen-' || new.video_id)
    );
  end if;
  return new;
exception when others then
  return new;  -- Push ist optional, darf den Status nie blockieren
end$$;

drop trigger if exists trg_video_aenderungen_raus on video_aenderungen;
create trigger trg_video_aenderungen_raus
  after update of status on video_aenderungen
  for each row execute function ofen_raus_push();
