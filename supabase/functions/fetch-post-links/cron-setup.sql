-- Alle 5 Minuten nachsehen, ob für ein frisch gepostetes Video die Adresse
-- abzuholen ist. Der Lauf tut nur etwas, wenn wirklich eines fällig ist --
-- läuft also die meiste Zeit ins Leere und kostet nichts.
--
-- kxrbeyecsdvejhvxtrin und eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmJleWVjc2R2ZWpodnh0cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDcxODgsImV4cCI6MjEwMjYyMzE4OH0.mtMuMDr0xpnqx-csEx199Q3A8DbymN7mqicRqHelKZk unten ersetzen, dann ausführen.

select cron.unschedule('fetch-post-links') where exists (
  select 1 from cron.job where jobname = 'fetch-post-links'
);

select cron.schedule(
  'fetch-post-links',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/fetch-post-links',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmJleWVjc2R2ZWpodnh0cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDcxODgsImV4cCI6MjEwMjYyMzE4OH0.mtMuMDr0xpnqx-csEx199Q3A8DbymN7mqicRqHelKZk"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
