-- =============================================================================
-- 0002 — Logos, Status "Geplant", Postingzeit
-- =============================================================================
-- Im Supabase SQL Editor einfuegen und "Run". Reihenfolge nach 0001.
-- =============================================================================

-- --- Kunden: Logo-URL -------------------------------------------------------
alter table clients add column if not exists logo_url text;

-- --- Videos: Postingzeit (zusaetzlich zum Datum) ----------------------------
alter table videos add column if not exists scheduled_time time;

-- --- Neuer Status "planned" (Geplant), einsortiert vor "posted" -------------
-- Hinweis: ADD VALUE laeuft NICHT in einer expliziten Transaktion. Der
-- Supabase SQL-Editor umschliesst einzelne Statements nicht mit BEGIN/COMMIT,
-- daher funktioniert das hier direkt.
alter type video_status add value if not exists 'planned' before 'posted';

-- =============================================================================
-- Supabase Storage: Bucket "logos" (oeffentlich lesbar, klein)
-- =============================================================================
-- Logos sind winzig -> Supabase Storage (kostenlos). Die grossen Videos gehen
-- spaeter zu Bunny, NICHT hierher.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Policies fuer den logos-Bucket
-- Oeffentlich lesbar (damit <img src> ohne Login-Token laedt):
drop policy if exists "logos_public_read" on storage.objects;
create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Nur eingeloggtes Team darf hochladen/aendern/loeschen:
drop policy if exists "logos_team_insert" on storage.objects;
create policy "logos_team_insert"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "logos_team_update" on storage.objects;
create policy "logos_team_update"
  on storage.objects for update
  using (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "logos_team_delete" on storage.objects;
create policy "logos_team_delete"
  on storage.objects for delete
  using (bucket_id = 'logos' and auth.role() = 'authenticated');
