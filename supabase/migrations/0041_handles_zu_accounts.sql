-- 0041: Handles am Kunden immer auch als Social-Account
-- =============================================================================
-- Problem: Einige Kunden (z. B. Kebab Kumpels) hatten ihre Handles nur in
-- clients.handle_ig / handle_tiktok -- etwa weil sie ueber den Assistenten
-- angelegt oder geaendert wurden. Der Bearbeiten-Dialog, die Statistik und
-- das Profilbild arbeiten aber mit client_accounts. Folge: leere Felder beim
-- Bearbeiten, keine Zahlen in der Analyse.
--
-- Loesung, nur additiv:
--   1. fehlende Accounts aus den beiden Spalten nachtragen
--   2. ein Trigger sorgt kuenftig dafuer, dass ein Handle, das direkt am Kunden
--      gesetzt wird, auch als Account existiert.
-- Darf mehrfach laufen.

insert into client_accounts (client_id, platform, handle, sort)
select c.id, 'instagram', lower(regexp_replace(trim(c.handle_ig), '^@', '')), 0
  from clients c
 where c.handle_ig is not null and trim(c.handle_ig) <> ''
   and not exists (select 1 from client_accounts a where a.client_id = c.id and a.platform = 'instagram')
on conflict do nothing;

insert into client_accounts (client_id, platform, handle, sort)
select c.id, 'tiktok', lower(regexp_replace(trim(c.handle_tiktok), '^@', '')), 0
  from clients c
 where c.handle_tiktok is not null and trim(c.handle_tiktok) <> ''
   and not exists (select 1 from client_accounts a where a.client_id = c.id and a.platform = 'tiktok')
on conflict do nothing;

-- Kuenftig: Handle am Kunden gesetzt -> Account anlegen bzw. Hauptaccount
-- nachziehen. Laeuft nicht, wenn die Aenderung selbst vom Account-Sync kommt
-- (pg_trigger_depth > 1) -- so koennen sich die beiden Trigger nicht
-- gegenseitig anstossen.
create or replace function handles_zu_accounts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text;
  h text;
  haupt uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  foreach p in array array['instagram', 'tiktok'] loop
    h := case p when 'instagram' then new.handle_ig else new.handle_tiktok end;
    h := lower(regexp_replace(trim(coalesce(h, '')), '^@', ''));
    continue when h = '';
    continue when exists (
      select 1 from client_accounts where client_id = new.id and platform = p and lower(handle) = h
    );
    select id into haupt from client_accounts
     where client_id = new.id and platform = p
     order by sort, created_at limit 1;
    if haupt is null then
      insert into client_accounts (client_id, platform, handle, sort) values (new.id, p, h, 0)
      on conflict do nothing;
    else
      update client_accounts set handle = h where id = haupt;
    end if;
  end loop;
  return null;
end$$;

revoke all on function handles_zu_accounts() from public, anon, authenticated;

create or replace trigger trg_handles_zu_accounts
  after insert or update of handle_ig, handle_tiktok on clients
  for each row execute function handles_zu_accounts();
