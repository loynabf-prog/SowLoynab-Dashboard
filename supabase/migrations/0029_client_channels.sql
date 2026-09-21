-- =============================================================================
-- 0029 — Kanäle innerhalb eines Kunden
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0028.
--
-- Ein Kunde kann zwei Betriebe unter einem Dach haben -- je mit eigenem
-- Instagram- UND TikTok-Account. Das ist mehr als ein Handle: es ist ein
-- eigener Kanal mit eigenem Publikum, und ein Video gehoert immer zu genau
-- einem davon.
--
-- Deshalb hier eine Ebene ueber den Accounts: der Kanal. Ein Kanal buendelt
-- die Accounts eines Betriebs, hat einen Namen und eine Farbe, und Videos
-- sowie Ideen haengen an ihm.
--
-- Fuer Kunden mit nur einem Kanal aendert sich nichts -- dort bleibt alles
-- ohne Kanal und die App zeigt gar keine Kanal-Bedienung an.
--
-- Gefahrlos und wiederholbar: alles mit "if not exists".
-- Voraussetzung: 0028 ist gelaufen.
-- =============================================================================

create table if not exists client_channels (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  name       text not null,               -- z. B. "Schleckofatz"
  -- Farbe fuer den Streifen an der Videokarte. Hex, damit sie direkt im
  -- style-Attribut landen kann.
  color      text not null default '#0071e3',
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_channels_client on client_channels (client_id);

-- Zwei Kanäle gleichen Namens beim selben Kunden ergeben keinen Sinn.
create unique index if not exists idx_client_channels_uniq
  on client_channels (client_id, lower(name));

drop trigger if exists trg_client_channels_updated_at on client_channels;
create trigger trg_client_channels_updated_at
  before update on client_channels
  for each row execute function set_updated_at();

alter table client_channels enable row level security;
drop policy if exists "team_all_client_channels" on client_channels;
create policy "team_all_client_channels" on client_channels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'client_channels'
  ) then
    alter publication supabase_realtime add table client_channels;
  end if;
end$$;

-- =============================================================================
-- Zuordnung
-- =============================================================================
-- Ueberall "on delete set null": wird ein Kanal geloescht, verlieren die
-- Videos nur ihre Zuordnung. Sie selbst bleiben unangetastet.

alter table client_accounts add column if not exists channel_id uuid
  references client_channels (id) on delete set null;
alter table videos          add column if not exists channel_id uuid
  references client_channels (id) on delete set null;
alter table video_ideas     add column if not exists channel_id uuid
  references client_channels (id) on delete set null;

create index if not exists idx_client_accounts_channel on client_accounts (channel_id);
create index if not exists idx_videos_channel          on videos (channel_id);
create index if not exists idx_video_ideas_channel     on video_ideas (channel_id);

-- =============================================================================
-- Vorhandene Account-Namen zu Kanälen machen
-- =============================================================================
-- Wer bei seinen Accounts schon Klarnamen vergeben hat ("Schleckofatz",
-- "Schmackofatz"), bekommt daraus direkt seine Kanäle -- inklusive
-- Zuordnung der Accounts. Nichts abzutippen.
--
-- Farben aus einer festen Reihe, damit sich zwei Kanäle desselben Kunden
-- nicht zufaellig gleichen. Nachtraeglich in der App aenderbar.
insert into client_channels (client_id, name, color, sort)
select
  x.client_id,
  x.label,
  (array['#0071e3', '#e0521a', '#34c759', '#af52de', '#ff9500', '#5ac8fa'])[
    ((x.rn - 1) % 6) + 1
  ],
  x.rn - 1
from (
  select
    client_id,
    trim(label) as label,
    row_number() over (partition by client_id order by min(sort), min(created_at)) as rn
  from client_accounts
  where label is not null and trim(label) <> ''
  group by client_id, trim(label)
) x
on conflict do nothing;

-- Accounts ihrem Kanal zuordnen (ueber den gleichlautenden Namen).
update client_accounts a
   set channel_id = k.id
  from client_channels k
 where k.client_id = a.client_id
   and lower(trim(a.label)) = lower(k.name)
   and a.channel_id is null;

-- =============================================================================
-- Vorhandene Videos zuordnen, wo es eindeutig ist
-- =============================================================================
-- Ein Video, dessen Posting-Link das Handle eines Accounts enthaelt, gehoert
-- zu dessen Kanal. Das trifft nicht jedes Video -- der Rest bleibt ohne
-- Zuordnung und wird in der App von Hand gesetzt. Lieber nichts zuordnen
-- als falsch zuordnen.
update videos v
   set channel_id = a.channel_id
  from client_accounts a
 where a.client_id = v.client_id
   and a.channel_id is not null
   and v.channel_id is null
   and (
     (a.platform = 'tiktok'    and v.tiktok_url    ilike '%@' || a.handle || '/%')
     or (a.platform = 'instagram' and v.instagram_url ilike '%/' || a.handle || '/%')
   );
