-- Stündlich aufrufen; die Funktion arbeitet nur um 3 und 17 Uhr deutscher Zeit.
select cron.unschedule('posts-abgleich') where exists (select 1 from cron.job where jobname = 'posts-abgleich');
select cron.schedule('posts-abgleich', '2 * * * *', $$
  select net.http_post(
    url := 'https://kxrbeyecsdvejhvxtrin.supabase.co/functions/v1/posts-abgleich',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
