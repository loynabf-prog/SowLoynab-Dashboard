-- =============================================================================
-- 0013 — Postfach (E-Mail im Dashboard, angebunden an Zoho Mail)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0012.
--
-- Speichert eingehende Mails, die die Edge-Function "mail-sync" aus Zoho holt.
-- Das Frontend liest ausschließlich aus dieser Tabelle (schnell, offline-fähig,
-- Realtime). Versendete Rechnungen laufen über "mail-send" direkt über Zoho —
-- die landen automatisch in eurem Zoho-"Gesendet"-Ordner.
-- =============================================================================

create table if not exists mails (
  id              uuid primary key default gen_random_uuid(),
  zoho_message_id text unique,                 -- Zoho messageId (verhindert Doppel-Import)
  folder          text default 'Inbox',
  from_address    text,
  from_name       text,
  to_address      text,
  subject         text,
  snippet         text,                        -- Kurzvorschau
  body_html       text,                        -- voller Inhalt (im Postfach angezeigt)
  received_at     timestamptz,
  is_read         boolean default false,
  archived        boolean default false,
  created_at      timestamptz default now()
);

create index if not exists mails_received_idx on mails (received_at desc);
create index if not exists mails_unread_idx   on mails (is_read) where is_read = false;

-- RLS + Realtime (nur eingeloggtes Team) — gleiche Logik wie 0006
alter table mails enable row level security;
drop policy if exists "team_all_mails" on mails;
create policy "team_all_mails" on mails for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mails'
  ) then
    execute 'alter publication supabase_realtime add table mails';
  end if;
end $$;
