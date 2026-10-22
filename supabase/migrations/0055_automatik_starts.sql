-- 0055 — Automatik nur starten, wenn es Arbeit gibt (Edge Function automatik-start).
-- Protokoll der Starts; dient auch als Sperre gegen Doppelstarts (10 Min.).
create table if not exists automatik_starts (
  id          uuid primary key default gen_random_uuid(),
  anlass      text,
  ok          boolean not null default true,
  fehler      text,
  session_url text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_automatik_starts_zeit on automatik_starts (created_at desc);
alter table automatik_starts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automatik_starts' and policyname = 'team_read_automatik_starts') then
    create policy "team_read_automatik_starts" on automatik_starts for select using (auth.role() = 'authenticated');
  end if;
end$$;
