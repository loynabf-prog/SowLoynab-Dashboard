-- Alle 5 Minuten nachsehen, ob für ein frisch gepostetes Video die Adresse
-- abzuholen ist. Der Lauf tut nur etwas, wenn wirklich eines fällig ist --
-- läuft also die meiste Zeit ins Leere und kostet nichts.
--
-- <PROJEKT-REF> und <ANON-KEY> unten ersetzen, dann ausführen.

select cron.unschedule('fetch-post-links') where exists (
  select 1 from cron.job where jobname = 'fetch-post-links'
);

select cron.schedule(
  'fetch-post-links',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJEKT-REF>.supabase.co/functions/v1/fetch-post-links',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON-KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
