-- =============================================================================
-- 0050 — Team-Chat
-- =============================================================================
-- Der Anstupser war eine Einbahnstrasse: eine Zeile in der Glocke, keine
-- Antwort, kein Verlauf. Der Chat ist das Gespraech dazu -- mit Kanaelen,
-- Aufgaben direkt im Verlauf und Claude als Mitleser, wenn man ihn ruft.
--
-- Kanaele:
--   team    -- alle (member_ids leer = jeder sieht ihn). Genau einer.
--   direkt  -- zwei Personen
--   gruppe  -- frei benannt, ausgewaehlte Personen (spaeter: Mitarbeiter)
--   claude  -- privater Chat einer Person mit Claude
--
-- Wie ueberall in der App: alle teilen sich einen Login, die Identitaet
-- ("ich bin Lion") kommt vom Geraet. member_ids ist Ordnung, keine Sperre.
-- =============================================================================

create table if not exists chat_channels (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('team', 'direkt', 'gruppe', 'claude')),
  name        text,                       -- nur bei gruppe/team; direkt zeigt den anderen Namen
  member_ids  uuid[] not null default '{}',
  created_by  uuid references team_members (id) on delete set null,
  created_at  timestamptz not null default now(),
  last_message_at timestamptz,
  deleted_at  timestamptz
);
create index if not exists idx_chat_channels_members on chat_channels using gin (member_ids);

create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references chat_channels (id) on delete cascade,
  author_id    uuid references team_members (id) on delete set null,  -- null bei Claude/System
  author_kind  text not null default 'mensch' check (author_kind in ('mensch', 'claude', 'system')),
  body         text not null default '',
  task_id      uuid references tasks (id) on delete set null,        -- Aufgaben-Karte im Verlauf
  plan         jsonb,              -- Schritte, die Claude vorschlaegt (wie im Assistenten)
  plan_status  text check (plan_status in ('offen', 'laeuft', 'ausgefuehrt', 'verworfen')),
  plan_result  jsonb,
  link         text,               -- optional: wohin die Nachricht fuehrt
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz
);
create index if not exists idx_chat_messages_channel on chat_messages (channel_id, created_at desc);
create index if not exists idx_chat_messages_task on chat_messages (task_id) where task_id is not null;

-- Bis wann hat wer einen Kanal gelesen?
create table if not exists chat_reads (
  channel_id   uuid not null references chat_channels (id) on delete cascade,
  member_id    uuid not null references team_members (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);

-- Kanal bekommt bei jeder Nachricht ein frisches last_message_at -> Liste sortiert sich selbst.
create or replace function chat_touch_channel() returns trigger
language plpgsql as $$
begin
  update chat_channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end$$;
-- Bewusst ohne DROP: der Supabase-Connector haelt "zerstoererische" Befehle
-- fuer eine Rueckfrage an, die in der App nicht ankommt -> Migration bricht ab.
create or replace trigger trg_chat_touch_channel after insert on chat_messages
  for each row execute function chat_touch_channel();

-- Ungelesene je Kanal fuer eine Person (eigene Nachrichten zaehlen nicht).
create or replace function chat_ungelesen(p_member uuid)
returns table (channel_id uuid, anzahl bigint)
language sql stable as $$
  select c.id, count(m.id)
  from chat_channels c
  join chat_messages m on m.channel_id = c.id and m.deleted_at is null
  left join chat_reads r on r.channel_id = c.id and r.member_id = p_member
  where c.deleted_at is null
    and (cardinality(c.member_ids) = 0 or p_member = any (c.member_ids))
    and (m.author_id is null or m.author_id <> p_member)
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by c.id
$$;

-- Der eine Team-Kanal fuer alle
insert into chat_channels (kind, name)
select 'team', 'Team'
where not exists (select 1 from chat_channels where kind = 'team');

-- --- RLS + Realtime (nur eingeloggtes Team), wie bei den Anstupsern -------------
alter table chat_channels enable row level security;
alter table chat_messages enable row level security;
alter table chat_reads enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['chat_channels', 'chat_messages', 'chat_reads']
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'team_all_' || t) then
      execute format(
        'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
        t
      );
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;

grant execute on function chat_ungelesen(uuid) to authenticated;
alter function chat_touch_channel() set search_path = public;
alter function chat_ungelesen(uuid) set search_path = public;
