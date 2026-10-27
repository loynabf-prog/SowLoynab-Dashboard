-- =============================================================================
-- 0063 — Schnittofen: eine Warteschlange fuer alles, was geschnitten wird
-- =============================================================================
-- Wie ein Pizzaofen (Fassie, 27.10.2026): Videos stehen in einer Reihenfolge,
-- eins nach dem anderen wird in Premiere geschnitten. Kommt eins raus, schaut
-- der Zustaendige die Vorschau an:
--   "Aendern" -> neuer Auftrag, hinten in die Schlange (oder nach vorne)
--   "Fertig"  -> aufs Tablett: bereit zum Posten (video_fertig, 0062)
--
-- Die Schlange ist video_aenderungen (gibt es seit 0054), jetzt mit:
--   art          'erstschnitt' (Video zum ersten Mal schneiden, wunsch = Anweisung)
--                | 'aenderung' (Wunsch zu einer fertigen Vorschau)
--   reihenfolge  kleiner = frueher dran; Standard = Zeitpunkt des Einreihens
--   gestartet_am wann die Automatik das Video in den Ofen geschoben hat
--
--   schlange_naechster()      die Automatik holt sich den naechsten Auftrag
--                             (setzt ihn atomar auf 'laeuft')
--   schlange_nach_vorne(id)   als Naechstes dran
-- Additiv und wiederholbar.
-- =============================================================================

alter table video_aenderungen add column if not exists art text not null default 'aenderung';
alter table video_aenderungen drop constraint if exists video_aenderungen_art_check;
alter table video_aenderungen add constraint video_aenderungen_art_check check (art in ('erstschnitt', 'aenderung'));
alter table video_aenderungen add column if not exists reihenfolge double precision;
alter table video_aenderungen alter column reihenfolge set default extract(epoch from now());
update video_aenderungen set reihenfolge = extract(epoch from created_at) where reihenfolge is null;
alter table video_aenderungen add column if not exists gestartet_am timestamptz;
create index if not exists idx_video_aenderungen_schlange on video_aenderungen (reihenfolge) where status = 'offen' and deleted_at is null;

comment on column video_aenderungen.art is 'erstschnitt = Video zum ersten Mal schneiden (wunsch = Anweisung) | aenderung = Wunsch zu einer Vorschau';
comment on column video_aenderungen.reihenfolge is 'Platz in der Schnitt-Schlange: kleiner = frueher. Standard = Zeit des Einreihens';

-- Naechster Auftrag fuer die Automatik. Nimmt nur, wenn gerade nichts laeuft
-- (immer eins nach dem anderen), und reserviert ihn sofort.
create or replace function schlange_naechster()
returns setof video_aenderungen
language plpgsql
set search_path = public
as $$
declare
  n uuid;
begin
  if exists (select 1 from video_aenderungen where status = 'laeuft' and deleted_at is null
             and updated_at > now() - interval '3 hours') then
    return;
  end if;
  select id into n from video_aenderungen
   where status = 'offen' and deleted_at is null
   order by reihenfolge nulls last, created_at
   limit 1
   for update skip locked;
  if n is null then return; end if;
  return query
    update video_aenderungen set status = 'laeuft', gestartet_am = now()
     where id = n returning *;
end$$;

-- Als Naechstes dran: vor alle anderen wartenden setzen.
create or replace function schlange_nach_vorne(p_id uuid)
returns void
language sql
set search_path = public
as $$
  update video_aenderungen
     set reihenfolge = coalesce((select min(reihenfolge) from video_aenderungen
                                  where status = 'offen' and deleted_at is null and id <> p_id), extract(epoch from now())) - 1
   where id = p_id and status = 'offen';
$$;
