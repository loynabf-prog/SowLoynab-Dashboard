-- Sicherheit (24.11.2026): offene Tueren schliessen. Bereits per apply_migration eingespielt.
-- 1) Hilfstabellen: nur noch Server (service_role)
alter table public._tt_map enable row level security;
alter table public._ig_map enable row level security;
alter table public._ig_req enable row level security;
revoke all on public._tt_map, public._ig_map, public._ig_req from anon, authenticated;

-- 2) Tabellen mit "jeder darf alles" -> nur eingeloggte Nutzer
do $$
declare t text;
begin
  foreach t in array array['dokumente','jobs','monats_kontrollen','quests','video_kommentare','zeit_sessions'] loop
    execute format('drop policy if exists team_alles on public.%I', t);
    execute format('create policy team_alles on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 3) Interne Funktionen nicht mehr ohne Login aufrufbar
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'ofen_raus_push','platzhalter_verbrauchen','referenz_monatsziel_sync','referenz_monatsziel_trigger',
      'stempel_start','stempel_stop','zeit_auswertung')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
