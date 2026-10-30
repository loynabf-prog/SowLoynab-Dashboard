-- 0071: Das Spiel -- Quests (Meilensteine und Aufgaben der Agentur) mit XP.
-- Fassie (30.10.2026): "Wir sind beide die CEOs, gemeinsam aufs naechste
-- Level." Ein Konto fuer die Agentur, keine Spieler. Alles andere (XP aus
-- Videos, Views, Monaten, Rechnungen, Kunden) rechnet src/lib/spiel.ts aus
-- den bestehenden Tabellen -- hier nur, was es im CRM noch nicht gab.
-- App: /spiel/ (eigene Web-App im selben Repo, gleiche Anmeldung).

create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  beschreibung text,
  xp integer not null default 500,
  art text not null default 'aufgabe' check (art in ('meilenstein','aufgabe')),
  status text not null default 'offen' check (status in ('offen','erledigt')),
  faellig date,
  ab_level integer not null default 0,
  sort integer not null default 0,
  erledigt_am timestamptz,
  erledigt_von uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table quests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'quests' and policyname = 'team_alles') then
    create policy team_alles on quests for all using (true) with check (true);
  end if;
end $$;
grant all on quests to anon, authenticated, service_role;

-- Startquests
insert into quests (titel, beschreibung, xp, art, ab_level, sort) values
 ('Personal Brand starten', '3 eigene Videos in 14 Tagen posten. Der Account, der euch Kunden bringt.', 2000, 'meilenstein', 0, 10),
 ('Private Krankenversicherung wechseln', 'Studentische Versicherung kündigen, PKV abschließen. Erledigt ist erledigt.', 500, 'aufgabe', 0, 20),
 ('Ersten 100k-Monat posten', 'Alle Kunden zusammen über 100.000 Views in einem Monat.', 1500, 'meilenstein', 1, 30),
 ('Zehnter zahlender Kunde', 'Zehn Kunden, die monatlich zahlen.', 5000, 'meilenstein', 2, 40),
 ('Büro suchen', 'Drei Büros anschauen, eins aussuchen. Freigeschaltet ab Boutique.', 3000, 'meilenstein', 3, 50),
 ('Ersten Mitarbeiter einstellen', 'Jemand, der schneidet oder dreht — damit ihr wachst. Freigeschaltet ab Haus.', 5000, 'meilenstein', 4, 60);
