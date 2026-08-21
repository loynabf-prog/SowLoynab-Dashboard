-- =============================================================================
-- 0010 — Kunden-Freigabe-Link (öffentlich, aber sicher via Funktionen)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0009.
--
-- Idee: Jedes Video hat ein share_token (aus Skript 7). Damit kannst du einem
-- Kunden einen Link schicken (app.sowloynab.de/freigabe/<token>). Er sieht NUR
-- dieses eine Video (Titel, Caption, Termin, Vorschau-Link) und kann es
-- freigeben oder Änderungen anfordern — ohne Login, ohne Zugriff auf alles
-- andere. Die Tabellen bleiben komplett gesperrt; nur diese zwei Funktionen
-- geben genau die nötigen Daten frei.
-- =============================================================================

-- Ein Video per Token lesen (nur die für die Freigabe nötigen Felder)
create or replace function public.get_video_by_token(t uuid)
returns table (
  id uuid,
  title text,
  caption text,
  scheduled_date date,
  scheduled_time time,
  video_url text,
  status text,
  approval_status text,
  approval_note text,
  client_name text
)
language sql
security definer
set search_path = public
as $$
  select v.id, v.title, v.caption, v.scheduled_date, v.scheduled_time,
         v.video_url, v.status, v.approval_status, v.approval_note, c.name
  from videos v
  join clients c on c.id = v.client_id
  where v.share_token = t
    and v.deleted_at is null
$$;

-- Freigabe setzen (approved | changes) + optionale Notiz
create or replace function public.set_video_approval(t uuid, new_status text, note text)
returns void
language sql
security definer
set search_path = public
as $$
  update videos
     set approval_status = new_status,
         approval_note   = nullif(btrim(coalesce(note, '')), ''),
         approved_at     = case when new_status = 'approved' then now() else approved_at end
   where share_token = t
     and deleted_at is null
$$;

-- Ausführungsrechte: anonyme Besucher (der Kunde) + eingeloggtes Team
grant execute on function public.get_video_by_token(uuid) to anon, authenticated;
grant execute on function public.set_video_approval(uuid, text, text) to anon, authenticated;
