-- =============================================================================
-- Postfach-Abruf alle 5 Minuten einrichten (einmalig)
-- =============================================================================
-- Supabase -> SQL Editor -> Run.
-- Vorher: Funktion "mail-sync" deployen, "Enforce JWT" ausschalten,
--         und die ZOHO_* Secrets setzen.
--
-- Ersetze:  DEIN-PROJEKT-REF  und  DEIN-ANON-KEY
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('mail-sync') where exists (
  select 1 from cron.job where jobname = 'mail-sync'
);

select cron.schedule(
  'mail-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://DEIN-PROJEKT-REF.supabase.co/functions/v1/mail-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer DEIN-ANON-KEY'),
    body    := '{}'::jsonb
  );
  $$
);
-- Prüfen: select * from cron.job;
-- Sofort testen: Funktion im Dashboard "Invoke" drücken.
