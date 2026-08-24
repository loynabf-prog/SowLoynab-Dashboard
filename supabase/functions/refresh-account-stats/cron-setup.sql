-- =============================================================================
-- Täglichen Zeitplan für die Account-Statistik einrichten (einmalig)
-- =============================================================================
-- Supabase -> SQL Editor -> Run.
-- Vorher: Funktion "refresh-account-stats" deployen, "Enforce JWT" ausschalten,
--         und das Secret APIFY_TOKEN setzen (dasselbe wie bei refresh-stats).
--
-- Ersetze:  DEIN-PROJEKT-REF  und  DEIN-ANON-KEY
-- Läuft täglich 05:45 UTC (15 Min. nach refresh-stats, damit sie sich nicht
-- gegenseitig blockieren).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('refresh-account-stats') where exists (
  select 1 from cron.job where jobname = 'refresh-account-stats'
);

select cron.schedule(
  'refresh-account-stats',
  '45 5 * * *',
  $$
  select net.http_post(
    url     := 'https://DEIN-PROJEKT-REF.supabase.co/functions/v1/refresh-account-stats',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer DEIN-ANON-KEY'),
    body    := '{}'::jsonb
  );
  $$
);
-- Prüfen: select * from cron.job;
-- Sofort testen: Funktion im Dashboard "Invoke" drücken.
