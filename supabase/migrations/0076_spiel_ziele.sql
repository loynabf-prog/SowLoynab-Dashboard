-- 0076: Das Spiel wird zum Tycoon -- Ziele mit echter Belohnung.
-- Fassie (11.11.2026): "Diese Spiele haben den Nachteil, da ist nichts Echtes
-- dahinter. Wir wollen das Spiel spielen, aber verbunden mit echten Zahlen."
-- Ein Ziel hat eine Bedingung aus echten Werten (Follower der Personal Brand,
-- Monatsumsatz, gepostete Videos, zahlende Kunden, Level oder ein Datum) und
-- optional eine echte Belohnung, die sich die beiden dann wirklich goennen.
-- Erreicht rechnet src/lib/spiel.ts; hier steht nur, was eingeloest wurde.
-- schluessel = feste Ziele, an denen das Spiel selbst haengt ('buero': ab dann
-- spielt das Studio im Buero statt im Cafe).

create table if not exists spiel_ziele (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  belohnung text,
  typ text not null check (typ in ('follower','umsatz','videos','kunden','level','datum')),
  wert numeric,
  datum date,
  schluessel text unique,
  eingeloest_am timestamptz,
  eingeloest_von uuid,
  sort integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table spiel_ziele enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'spiel_ziele' and policyname = 'team_alles') then
    create policy team_alles on spiel_ziele for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on spiel_ziele to authenticated, service_role;

insert into spiel_ziele (titel, belohnung, typ, datum, schluessel, sort)
values ('Einzug ins Büro', 'Raus aus dem Café: das eigene Büro in Münster.', 'datum', '2026-12-01', 'buero', 10)
on conflict (schluessel) do nothing;

-- Die alte Quest "Buero suchen" (ab Level 3) ist ueberholt: das Buero steht zum 1.12. fest.
update quests set titel = 'Ins Büro einziehen', beschreibung = 'Schlüssel abholen, Tische rein, erstes Video aus dem Büro.', faellig = '2026-12-01', ab_level = 0
where titel = 'Büro suchen' and status = 'offen' and deleted_at is null;

-- Follower der Personal Brand taeglich holen (statt nur montags): eigener Cron,
-- der refresh-account-stats mit { "nur_eigen": true } ruft -- zwei Abrufe am Tag.
-- Uebernimmt Adresse und Schluessel vom bestehenden Wochen-Cron.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'refresh-account-stats')
     and not exists (select 1 from cron.job where jobname = 'spiel-follower') then
    perform cron.schedule('spiel-follower', '50 5 * * *',
      (select replace(command, $a$'{}'::jsonb$a$, $b$'{"nur_eigen":true}'::jsonb$b$) from cron.job where jobname = 'refresh-account-stats'));
  end if;
end $$;
