-- =============================================================================
-- ZEITPLAENE (CRON) — fertig ausgefuellt, einfach einfuegen und "Run"
-- =============================================================================
-- Richtet BEIDE taeglichen Jobs auf einmal ein:
--   05:30 UTC  refresh-stats          -> Zahlen pro Video
--   05:45 UTC  refresh-account-stats  -> Follower/Following/Posts pro Kunde
--
-- Projekt-Kennung und Anon-Key sind bereits eingetragen — nichts ersetzen.
-- (Der Anon-Key ist oeffentlich: er steckt ohnehin in der ausgelieferten App
--  und ist durch die Zugriffsregeln der Datenbank abgesichert.)
--
-- Gefahrlos: Ein vorhandener Job wird zuerst entfernt und neu gesetzt.
-- Mehrfaches Ausfuehren erzeugt keine Doppel-Jobs.
--
-- Erwartete Rueckmeldung: "Success. 1 row returned" — die Zahl ist die
-- Job-Nummer des zuletzt angelegten Zeitplans. Das ist der Normalfall.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- --- 1) Video-Zahlen: taeglich 05:30 UTC -------------------------------------
select cron.unschedule('refresh-stats') where exists (
  select 1 from cron.job where jobname = 'refresh-stats'
);

select cron.schedule(
  'refresh-stats',
  '30 5 * * *',
  $$
  select net.http_post(
    url     := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/refresh-stats',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmJleWVjc2R2ZWpodnh0cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDcxODgsImV4cCI6MjEwMjYyMzE4OH0.mtMuMDr0xpnqx-csEx199Q3A8DbymN7mqicRqHelKZk'),
    body    := '{}'::jsonb
  );
  $$
);


-- --- 2) Account-Zahlen: taeglich 05:45 UTC -----------------------------------
select cron.unschedule('refresh-account-stats') where exists (
  select 1 from cron.job where jobname = 'refresh-account-stats'
);

select cron.schedule(
  'refresh-account-stats',
  '45 5 * * *',
  $$
  select net.http_post(
    url     := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/refresh-account-stats',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmJleWVjc2R2ZWpodnh0cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDcxODgsImV4cCI6MjEwMjYyMzE4OH0.mtMuMDr0xpnqx-csEx199Q3A8DbymN7mqicRqHelKZk'),
    body    := '{}'::jsonb
  );
  $$
);


-- =============================================================================
-- Kontrolle: zeigt beide Zeitplaene an
--   select jobname, schedule, active from cron.job order by jobname;
-- =============================================================================
