-- =============================================================================
-- 0065 — Briefkasten, Zum Posten, Archiv (Fassie, 28.10.2026)
-- =============================================================================
-- Neue Dropbox-Struktur:
--   /Sow & Loynab Media/1 Briefkasten/<Kunde>        nach dem Drehtag alles rein
--   /Sow & Loynab Media/2 In Arbeit/<Kunde> - <Idee> ein Ordner pro Video
--   /Sow & Loynab Media/3 Zum Posten/<Kunde> - <Idee>.mp4   beste Qualitaet
--   /Sow & Loynab Archiv/<Kunde>/<Datum> <Idee>      Hintergrund (online-only)
--
--   videos.archiv_pfad   wohin der Arbeitsordner beim Servieren gewandert ist.
--                        Ist das Video ueberall gepostet (TikTok + Instagram),
--                        holt die Automatik die Datei aus "3 Zum Posten" dazu.
--   briefkasten_starts   Protokoll des Briefkasten-Waechters (keine Doppelstarts)
-- Additiv und wiederholbar.
-- =============================================================================

alter table videos add column if not exists archiv_pfad text;
comment on column videos.archiv_pfad is 'Arbeitsordner im Archiv (/Sow & Loynab Archiv/<Kunde>/<Datum> <Idee>), gesetzt beim Servieren';

create table if not exists briefkasten_starts (
  id         uuid primary key default gen_random_uuid(),
  ordner     text not null,
  dateien    int not null default 0,
  auftrag_id uuid,
  created_at timestamptz not null default now()
);
alter table briefkasten_starts enable row level security;

-- Briefkasten-Waechter alle 5 Minuten (eingespielt per SQL am 28.10.2026):
-- select cron.schedule('briefkasten-waechter', '*/5 * * * *', $$
--   select net.http_post(url := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/briefkasten-waechter',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon key>'),
--     body := '{}'::jsonb, timeout_milliseconds := 60000); $$);
