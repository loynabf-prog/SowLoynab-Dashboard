-- =============================================================================
-- 0035 — Vertrag: Konditionen, Ablage der PDF-Kopie, Versandprotokoll
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0034.
--
-- Was neu ist:
--   1. Die kaufmaennischen Eckdaten (Videoanzahl, Netto, USt, Brutto,
--      Rechnungsanschrift) stehen jetzt IM Vertragstext, nicht mehr
--      "gesondert vereinbart". Dafuer braucht die Datenbank nichts Neues --
--      der Text liegt wie bisher komplett in contracts.body.
--   2. Ist ein Vertrag unterschrieben, legt die App die PDF-Kopie im Storage
--      ab (Bucket "vertraege", NICHT oeffentlich) und merkt sich den Pfad.
--   3. Wird der Vertrag per Mail verschickt, wird protokolliert, wann und an
--      wen -- damit spaeter nachvollziehbar ist, dass er beim Kunden ankam.
-- =============================================================================

alter table contracts add column if not exists pdf_path     text;
alter table contracts add column if not exists mail_sent_at timestamptz;
alter table contracts add column if not exists mail_to      text;

comment on column contracts.pdf_path is
  'Pfad im Storage-Bucket "vertraege" zur unterschriebenen PDF-Kopie.';

-- --- Ablage fuer die unterschriebenen Vertraege ------------------------------
-- Bewusst NICHT oeffentlich: ein Vertrag enthaelt Namen und Betraege. Das
-- Team kommt eingeloggt dran, der Kunde ueber seinen eigenen Vertragslink.
insert into storage.buckets (id, name, public)
values ('vertraege', 'vertraege', false)
on conflict (id) do nothing;

drop policy if exists "vertraege_team_read" on storage.objects;
create policy "vertraege_team_read"
  on storage.objects for select
  using (bucket_id = 'vertraege' and auth.role() = 'authenticated');

drop policy if exists "vertraege_team_insert" on storage.objects;
create policy "vertraege_team_insert"
  on storage.objects for insert
  with check (bucket_id = 'vertraege' and auth.role() = 'authenticated');

drop policy if exists "vertraege_team_update" on storage.objects;
create policy "vertraege_team_update"
  on storage.objects for update
  using (bucket_id = 'vertraege' and auth.role() = 'authenticated');

drop policy if exists "vertraege_team_delete" on storage.objects;
create policy "vertraege_team_delete"
  on storage.objects for delete
  using (bucket_id = 'vertraege' and auth.role() = 'authenticated');
