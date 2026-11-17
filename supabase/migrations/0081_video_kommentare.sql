-- 0081: Zeitgenaue Korrekturen im Schnitt-Raum (/schnitt).
-- ---------------------------------------------------------------------------
-- Fassie (17.11.2026): "Video pausieren, in dem Moment einen Text schreiben --
-- und du weisst genau, welche Sekunde gemeint ist."
-- Eine Zeile je Anmerkung: Sekunde (auf 1/100), optional ein Punkt im Bild
-- (x/y 0..1, "hier") und optional ein Bereich bis_sekunde. Gebuendelt an
-- Claude gehen sie als EIN Auftrag in video_aenderungen (art = aenderung),
-- die einzelnen Kommentare merken sich, in welchem Auftrag sie stecken.

create table if not exists video_kommentare (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  datei text,                       -- Dropbox-Pfad der Vorschau (Version), zu der es gehoert
  sekunde numeric(8,2) not null check (sekunde >= 0),
  bis_sekunde numeric(8,2) check (bis_sekunde is null or bis_sekunde > sekunde),
  x real check (x is null or (x >= 0 and x <= 1)),
  y real check (y is null or (y >= 0 and y <= 1)),
  text text not null check (length(trim(text)) > 0),
  erledigt boolean not null default false,
  erledigt_am timestamptz,
  aenderung_id uuid references video_aenderungen(id) on delete set null,
  member_id uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists video_kommentare_video on video_kommentare (video_id, sekunde);

alter table video_kommentare enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'video_kommentare' and policyname = 'team_alles') then
    create policy team_alles on video_kommentare for all using (true) with check (true);
  end if;
end $$;
grant all on video_kommentare to anon, authenticated, service_role;
alter publication supabase_realtime add table video_kommentare;

comment on table video_kommentare is
  'Zeitgenaue Korrekturen aus dem Schnitt-Raum (0081). Claude liest offene: select sekunde, bis_sekunde, x, y, text from video_kommentare where video_id = ... and not erledigt order by sekunde;';
