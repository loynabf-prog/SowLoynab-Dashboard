-- =============================================================================
-- Täglichen Zeitplan für die Erinnerungen einrichten (einmalig)
-- =============================================================================
-- Supabase -> SQL Editor -> Run.
-- Vorher: Funktion "daily-reminders" deployen UND dort "Enforce JWT" ausschalten
--         (Edge Functions -> daily-reminders -> Settings).
--
-- Ersetze ZWEI Platzhalter:
--   1. DEIN-PROJEKT-REF  -> dein Supabase-Projekt-Ref (z. B. kxrbeyecsdvejhvxtrin)
--   2. DEIN-ANON-KEY     -> dein anon key (Project Settings -> API)
--
-- Feuert jeden Tag um 07:00 UTC (= 08:00 bzw. 09:00 deutsche Zeit).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Falls schon vorhanden, erst entfernen (idempotent)
select cron.unschedule('daily-reminders') where exists (
  select 1 from cron.job where jobname = 'daily-reminders'
);

select cron.schedule(
  'daily-reminders',
  '0 7 * * *',
  $$
  select net.http_post(
    url     := 'https://DEIN-PROJEKT-REF.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer DEIN-ANON-KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Prüfen:  select * from cron.job;
-- Testen ohne Warten:  einfach die Funktion im Dashboard "Invoke" drücken.
