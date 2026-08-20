-- =============================================================================
-- 0009 — Anstupser ("Nudges") + Handy-Push (Web Push)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0008.
--
-- Idee: Jemand macht etwas fertig (z. B. Video-Link hochgeladen) und stupst
-- eine andere Person an ("A: Video 2 ist fertig, kannst posten"). Der Anstupser
-- taucht bei der Person in der Glocke auf; ein Klick öffnet GENAU die Sache.
-- Optional kommt zusätzlich eine echte Push-Benachrichtigung aufs Handy.
-- =============================================================================

-- --- Anstupser ---------------------------------------------------------------
create table if not exists nudges (
  id           uuid primary key default gen_random_uuid(),
  from_name    text,                                  -- wer stupst (Anzeigename)
  to_member_id uuid references team_members (id) on delete cascade,  -- wen
  body         text not null,                         -- kurze Nachricht
  link         text,                                  -- wohin klicken (z. B. /client/<id>?video=<id>)
  read         boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_nudges_member on nudges (to_member_id, read);

-- --- Handy-Push-Abos (ein Eintrag pro Gerät+Person) --------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references team_members (id) on delete cascade,   -- "ich bin auf diesem Gerät = Lion"
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_member on push_subscriptions (member_id);

-- --- RLS + Realtime (nur eingeloggtes Team) ----------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['nudges', 'push_subscriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team_all_%1$s" on %1$I', t);
    execute format(
      'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;
