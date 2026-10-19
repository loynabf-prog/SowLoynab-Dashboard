-- 0043: Handle-Sync nur fuer die betroffene Plattform
-- =============================================================================
-- Der Sync aus 0028 hat bei JEDER Aenderung an einem Account beide Spalten
-- (handle_ig UND handle_tiktok) neu aus client_accounts gesetzt. Fehlte fuer
-- eine Plattform noch der Account, wurde das dortige Handle stillschweigend
-- auf NULL gesetzt. So ist z. B. bei Kebab Kumpels das TikTok-Handle
-- verloren gegangen. Jetzt wird nur die Plattform des geaenderten Accounts
-- nachgezogen.

create or replace function sync_client_handles() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ziel uuid := coalesce(new.client_id, old.client_id);
  betroffen text[] := array_remove(array[
    case when tg_op <> 'DELETE' then new.platform end,
    case when tg_op <> 'INSERT' then old.platform end
  ], null);
begin
  update clients set
    handle_ig = case when 'instagram' = any(betroffen) then (
      select handle from client_accounts
       where client_id = ziel and platform = 'instagram'
       order by sort, created_at limit 1
    ) else handle_ig end,
    handle_tiktok = case when 'tiktok' = any(betroffen) then (
      select handle from client_accounts
       where client_id = ziel and platform = 'tiktok'
       order by sort, created_at limit 1
    ) else handle_tiktok end
  where id = ziel;
  return null;
end$$;

-- Einmalig: das verlorene TikTok-Handle von Kebab Kumpels wiederherstellen.
insert into client_accounts (client_id, platform, handle, sort)
select id, 'tiktok', 'kebabkumpels', 0 from clients where name = 'Kebab Kumpels' and deleted_at is null
on conflict do nothing;
