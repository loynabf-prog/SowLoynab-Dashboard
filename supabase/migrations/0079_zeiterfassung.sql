-- 0079: Zeiterfassung nach Jobs ("in die Rolle gehen").
-- ---------------------------------------------------------------------------
-- Fassie (15.11.2026): Jeder Bereich der Agentur ist ein Job, den spaeter ein
-- Mitarbeiter uebernehmen kann. Bis dahin sind Fassie und Lion alle
-- Mitarbeiter: wer Videos schneidet, geht in die Rolle "Video-Editor", wer
-- Buchhaltung macht, in "Buchhaltung" -- die Zeit laeuft, solange man drin
-- ist. So sehen wir, wo die meiste Zeit hingeht und fuer welchen Output.
--
--   jobs           die Rollen (mit Seiten, die ein Mitarbeiter darin braucht)
--   zeit_sessions  eine Zeile je "drin sein": wer, welcher Job, von--bis,
--                  optional Kunde und was dabei rauskam
--   stempel_start / stempel_stop   -- fuer App UND Claude-Chats
--   zeit_auswertung(von, bis)      -- Minuten und Output je Job
--
-- Die alten, nie benutzten Tabellen time_entries und zentrale.zeiten bleiben
-- unberuehrt (leer).

create table if not exists jobs (
  slug text primary key,
  name text not null,            -- Bereich, z. B. "Videoschnitt"
  rolle text not null,           -- Jobtitel, z. B. "Video-Editor"
  was text not null,             -- ein Satz: was gehoert dazu
  farbe text not null,
  icon text not null,            -- lucide-Name
  seiten text[] not null default '{}',  -- CRM-Seiten, die die Rolle braucht (spaeter Zugriff)
  output text,                   -- Beschriftung des automatisch gezaehlten Outputs
  sort int not null default 100,
  aktiv boolean not null default true
);

insert into jobs (slug, name, rolle, was, farbe, icon, seiten, output, sort) values
  ('schnitt',         'Videoschnitt',      'Video-Editor',        'Videos schneiden, Korrekturrunden, Export und Vorschauen', '#ff6b00', 'Scissors',      '{/werkstatt,/ofen}',                 'Videos gepostet',   10),
  ('skripte',         'Ideen & Skripte',   'Content-Stratege',    'Videoideen, Hooks und Skripte für die Kunden',             '#8b5cf6', 'Lightbulb',     '{/lexikon,/inspirationen}',          'Videos angelegt',   20),
  ('dreh',            'Dreh',              'Videograf',           'Drehtage, Filmen vor Ort, Fahrt hin und zurück',           '#ef4444', 'Video',         '{/kalender}',                        'Drehtage',          30),
  ('posting',         'Posting',           'Social-Media-Manager','Captions, Einplanen bei Metricool, Links nachziehen',      '#ec4899', 'Send',          '{/plan,/ofen}',                      'Videos gepostet',   40),
  ('analyse',         'Analyse',           'Analyst',             'Zahlen auswerten, was funktioniert, Leitfäden',            '#14b8a6', 'BarChart3',     '{/analyse,/leistung}',               null,                50),
  ('kundenbetreuung', 'Kundenbetreuung',   'Kundenbetreuer',      'Kundenkontakt, Briefings, Feedback, Kundentermine',        '#0ea5e9', 'Handshake',     '{/kunden,/kalender}',                'Kundentermine',     60),
  ('akquise',         'Akquise',           'Vertrieb',            'Leads ansprechen, Gespräche, Angebote, neue Kunden',       '#22c55e', 'Target',        '{/leads}',                           'Neue Leads',        70),
  ('buchhaltung',     'Buchhaltung',       'Buchhalter',          'Rechnungen, Belege, Kontoauszüge, Steuern',                '#eab308', 'Receipt',       '{/monate,/rechnungen,/finanzen}',    'Rechnungen',        80),
  ('automation',      'KI & Automation',   'Automation-Entwickler','CRM, Claude, Abläufe und Schnitt automatisieren',         '#6366f1', 'Bot',           '{/einstellungen}',                   null,                90),
  ('marke',           'Personal Brand',    'Marketing',           'Eigene Videos und Agentur-Marketing',                      '#f97316', 'Megaphone',     '{/brand}',                           null,               100),
  ('verwaltung',      'Verwaltung',        'Office-Manager',      'Verträge, Dokumente, Versicherungen, Mails, Behörden',     '#64748b', 'FolderOpen',    '{/dokumente,/firma,/postfach}',      null,               110),
  ('fuehrung',        'Geschäftsführung',  'Geschäftsführer',     'Planung, Strategie, Team, Entscheidungen',                 '#111827', 'Compass',       '{}',                                 null,               120)
on conflict (slug) do nothing;

create table if not exists zeit_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  job text not null references jobs(slug),
  client_id uuid references clients(id) on delete set null,
  start timestamptz not null default now(),
  ende timestamptz,
  ergebnis text,                  -- was dabei rauskam (beim Stoppen)
  quelle text not null default 'app' check (quelle in ('app', 'chat', 'nachgetragen')),
  created_at timestamptz not null default now(),
  check (ende is null or ende > start)
);
create index if not exists zeit_sessions_start on zeit_sessions (start desc);
-- je Person hoechstens ein laufender Job
create unique index if not exists zeit_sessions_eine_laufend on zeit_sessions (member_id) where ende is null;

alter table jobs enable row level security;
alter table zeit_sessions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'team_alles') then
    create policy team_alles on jobs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zeit_sessions' and policyname = 'team_alles') then
    create policy team_alles on zeit_sessions for all using (true) with check (true);
  end if;
end $$;
grant all on jobs, zeit_sessions to anon, authenticated, service_role;

-- Laenge einer Session in Minuten. Laeuft eine seit ueber 12 h, wurde das
-- Stoppen vergessen -- dann zaehlen hoechstens 12 h.
create or replace function zeit_minuten(s zeit_sessions) returns numeric language sql stable as $$
  select round(extract(epoch from (least(coalesce(s.ende, now()), s.start + interval '12 hours') - s.start)) / 60.0, 1)
$$;

-- In einen Job gehen. Laeuft schon einer, wird er beendet (Wechsel).
-- person: Name ('Fassie'/'Lion') oder team_members.id
create or replace function stempel_start(person text, job_slug text, kunde uuid default null, quelle_ text default 'app')
returns zeit_sessions language plpgsql security definer set search_path = public as $$
declare m uuid; neu zeit_sessions;
begin
  select id into m from team_members where id::text = person or lower(name) = lower(person) limit 1;
  if m is null then raise exception 'Unbekannte Person: %', person; end if;
  if not exists (select 1 from jobs where slug = job_slug) then raise exception 'Unbekannter Job: %', job_slug; end if;
  update zeit_sessions set ende = greatest(now(), start + interval '1 second') where member_id = m and ende is null;
  insert into zeit_sessions (member_id, job, client_id, quelle) values (m, job_slug, kunde, quelle_) returning * into neu;
  return neu;
end $$;

-- Aus dem Job gehen, optional mit Ergebnis ("3 Videos fertig geschnitten").
create or replace function stempel_stop(person text, ergebnis_ text default null)
returns zeit_sessions language plpgsql security definer set search_path = public as $$
declare m uuid; alt zeit_sessions;
begin
  select id into m from team_members where id::text = person or lower(name) = lower(person) limit 1;
  if m is null then raise exception 'Unbekannte Person: %', person; end if;
  update zeit_sessions set ende = greatest(least(now(), start + interval '12 hours'), start + interval '1 second'),
         ergebnis = coalesce(nullif(trim(ergebnis_), ''), ergebnis)
   where member_id = m and ende is null returning * into alt;
  return alt;
end $$;
grant execute on function stempel_start(text, text, uuid, text), stempel_stop(text, text), zeit_minuten(zeit_sessions) to anon, authenticated, service_role;

-- Auswertung je Job fuer einen Zeitraum (Berliner Tage, bis inklusive).
-- person null = ganze Agentur.
create or replace function zeit_auswertung(von date, bis date, person uuid default null)
returns table (job text, name text, rolle text, farbe text, icon text, minuten numeric, sessions int,
               output_label text, output_anzahl int, ergebnisse text[])
language sql stable security definer set search_path = public as $$
  with z as (
    select s.*, zeit_minuten(s) as min
    from zeit_sessions s
    where (s.start at time zone 'Europe/Berlin')::date between von and bis
      and (person is null or s.member_id = person)
  ),
  o as (
    select 'schnitt' j, count(*)::int n from videos where deleted_at is null and posted_at is not null and (posted_at at time zone 'Europe/Berlin')::date between von and bis
    union all select 'posting', count(*)::int from videos where deleted_at is null and posted_at is not null and (posted_at at time zone 'Europe/Berlin')::date between von and bis
    union all select 'skripte', count(*)::int from videos where deleted_at is null and (created_at at time zone 'Europe/Berlin')::date between von and bis and coalesce(notes, '') not ilike '%Automatisch eingetragen%'
    union all select 'dreh', count(*)::int from events where deleted_at is null and starts_on between von and bis and (kind ilike '%dreh%' or title ilike '%dreh%')
    union all select 'kundenbetreuung', count(*)::int from events where deleted_at is null and client_id is not null and starts_on between von and bis and not (kind ilike '%dreh%' or title ilike '%dreh%')
    union all select 'akquise', count(*)::int from leads where deleted_at is null and (created_at at time zone 'Europe/Berlin')::date between von and bis
    union all select 'buchhaltung', count(*)::int from invoices where coalesce(issued_on, (created_at at time zone 'Europe/Berlin')::date) between von and bis
  )
  select j.slug, j.name, j.rolle, j.farbe, j.icon,
         coalesce(sum(z.min), 0), count(z.id)::int,
         j.output, (select n from o where o.j = j.slug),
         coalesce(array_agg(z.ergebnis order by z.start desc) filter (where z.ergebnis is not null), '{}')
  from jobs j left join z on z.job = j.slug
  where j.aktiv
  group by j.slug, j.name, j.rolle, j.farbe, j.icon, j.output, j.sort
  order by coalesce(sum(z.min), 0) desc, j.sort
$$;
grant execute on function zeit_auswertung(date, date, uuid) to anon, authenticated, service_role;

alter publication supabase_realtime add table zeit_sessions;

comment on table jobs is 'Jobs/Rollen der Agentur (0079) – je Bereich ein Job, den spaeter ein Mitarbeiter uebernehmen kann.';
comment on table zeit_sessions is 'Zeiterfassung (0079): wer war wann in welchem Job. Starten/Stoppen: select stempel_start(''Fassie'', ''schnitt''); select stempel_stop(''Fassie'', ''2 Videos fertig'');';
comment on function stempel_start(text, text, uuid, text) is 'In einen Job gehen (beendet den laufenden). Aus Claude-Chats: select stempel_start(''Fassie'', ''buchhaltung'', null, ''chat'');';
