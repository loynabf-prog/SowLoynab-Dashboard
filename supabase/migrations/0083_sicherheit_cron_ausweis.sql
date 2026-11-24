-- Sicherheit (24.11.2026): geheimer Ausweis fuer Zeitplaene und DB-Aufrufe der Edge Functions.
-- Die Edge Functions lassen (ueber _shared/tuersteher.ts) nur noch eingeloggte Nutzer,
-- den Service-Role-Schluessel oder diesen Ausweis (Header x-cron-secret) durch.
-- Bereits per apply_migration eingespielt.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Ausweis fuer Cron/DB-Aufrufe der Edge Functions');
  end if;
end $$;

create or replace function public.cron_kopf()
returns jsonb language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')) $$;
revoke all on function public.cron_kopf() from public, anon, authenticated;
grant execute on function public.cron_kopf() to service_role;

create or replace function public.cron_ausweis_pruefen(s text)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(s, '') <> '' and s = (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') $$;
revoke all on function public.cron_ausweis_pruefen(text) from public, anon, authenticated;
grant execute on function public.cron_ausweis_pruefen(text) to service_role;

-- Zeitplaene: Ausweis zusaetzlich mitschicken (Authorization bleibt unveraendert)
do $$ declare j record; begin
  for j in select jobid, command from cron.job where command like '%functions/v1/%' and command not like '%cron_kopf%' loop
    perform cron.alter_job(j.jobid, command := regexp_replace(j.command, 'headers\s*:=\s*', 'headers := public.cron_kopf() || ', 'g'));
  end loop;
end $$;

-- Datenbank-Funktionen, die Edge Functions aufrufen
do $$ declare f record; d text; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname || '.' || p.proname in ('public.ofen_raus_push','claude.lexware','claude.lexware_sync_start') loop
    d := pg_get_functiondef(f.oid);
    if d not like '%cron_kopf%' then
      execute regexp_replace(d, 'headers\s*:=\s*', 'headers := public.cron_kopf() || ', 'g');
    end if;
  end loop;
end $$;
