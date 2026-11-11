-- 0077: Das Dorf -- eingesammelte XP.
-- Echte Arbeit laesst im Spiel XP-Blasen ueber den Gebaeuden entstehen; erst
-- das Einsammeln zaehlt sie in die Leiste. Hier steht je Quelle, wie viel
-- schon eingesammelt ist (eine Zeile fuer die ganze Agentur -- Fassie und Lion
-- spielen zusammen, nicht gegeneinander). Verdient wird weiter nur aus echten
-- Daten (src/lib/spiel.ts); diese Tabelle aendert daran nichts.

create table if not exists spiel_beute (
  id smallint primary key default 1 check (id = 1),
  quellen jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table spiel_beute enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'spiel_beute' and policyname = 'team_alles') then
    create policy team_alles on spiel_beute for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on spiel_beute to authenticated, service_role;
