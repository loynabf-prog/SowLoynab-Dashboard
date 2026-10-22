-- =============================================================================
-- 0052 — Import aus Google-Drive-Links nach Dropbox
-- =============================================================================
-- Kunden schicken Material oft als Drive-Ordner. Ein Import holt alle Dateien
-- daraus in den _Eingang eines Kunden -- Dropbox laedt sie selbst vom Link
-- (files/save_url), nichts laeuft ueber ein Handy.
--
-- Die Edge Function "drive-import" arbeitet nur Zeilen dieser Tabelle ab.
-- Wer sie aufruft, kann also nichts Eigenes einschleusen: neue Importe legt
-- nur das eingeloggte Team an (RLS), das Ziel muss ein _Eingang sein.
-- Bewusst ohne DROP (Supabase-Connector, siehe 0050).
-- =============================================================================

create table if not exists drive_importe (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients (id) on delete set null,
  quelle      text not null,                -- Link auf den Drive-Ordner
  ziel        text not null                 -- Dropbox-Ordner, muss auf /_Eingang enden
              check (ziel ~ '^/Sow & Loynab Media/01_Kunden/[^/]+/_Eingang$'),
  status      text not null default 'neu' check (status in ('neu', 'laeuft', 'fertig', 'fehler')),
  dateien     jsonb not null default '[]',  -- [{id, name, job, status}]
  notiz       text,
  created_by  uuid references team_members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table drive_importe enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'drive_importe' and policyname = 'team_all_drive_importe') then
    create policy "team_all_drive_importe" on drive_importe for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'drive_importe') then
    alter publication supabase_realtime add table drive_importe;
  end if;
end$$;

-- Alle 2 Minuten weiterarbeiten, solange ein Import offen ist (eingespielt per cron.schedule):
--   select cron.schedule('drive-import', '*/2 * * * *', $$ select net.http_post(
--     url := '<SUPABASE_URL>/functions/v1/drive-import', headers := '{"Authorization":"Bearer <anon key>"}',
--     body := '{}'::jsonb) where exists (select 1 from public.drive_importe where status in ('neu','laeuft')); $$);
