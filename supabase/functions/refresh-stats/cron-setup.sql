-- =============================================================================
-- Täglichen Zeitplan für die Auto-Statistik einrichten (einmalig)
-- =============================================================================
-- Supabase -> SQL Editor -> Run.
-- Vorher: Funktion "refresh-stats" deployen, "Enforce JWT" ausschalten,
--         und das Secret APIFY_TOKEN setzen.
--
-- Ersetze:  DEIN-PROJEKT-REF  und  DEIN-ANON-KEY
-- Läuft täglich 05:30 UTC (früh, damit die Zahlen morgens frisch sind).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('refresh-stats') where exists (
  select 1 from cron.job where jobname = 'refresh-stats'
);

select cron.schedule(
  'refresh-stats',
  '30 5 * * *',
  $$
  select net.http_post(
    url     := 'https://DEIN-PROJEKT-REF.supabase.co/functions/v1/refresh-stats',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer DEIN-ANON-KEY'),
    body    := '{}'::jsonb
  );
  $$
);
-- Prüfen: select * from cron.job;
-- Sofort testen: Funktion im Dashboard "Invoke" drücken (dauert je nach Anzahl Videos etwas).
