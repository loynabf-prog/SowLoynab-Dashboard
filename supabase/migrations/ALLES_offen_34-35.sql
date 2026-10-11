-- =============================================================================
-- ALLES OFFEN 34–35 — Sammel-Skript
-- =============================================================================
-- Fasst 0034 und 0035 zusammen: im Supabase SQL Editor EINMAL einfügen,
-- "Run" drücken, fertig.
--
-- Gefahrlos: alles mit "if not exists" bzw. "drop ... if exists" — was schon
-- gelaufen ist, wird übersprungen. Ein zweiter Durchlauf schadet nicht.
--
-- Voraussetzung: ALLES_offen_29-33.sql ist gelaufen.
--
-- Danach ist in der App freigeschaltet:
--   * Drehtage beim Kunden: Termin mit N Videos und Skript je Video
--   * Vertrag mit Videoanzahl, Netto, Brutto und Rechnungsanschrift im Text
--   * unterschriebene Verträge liegen als PDF im System und gehen per Mail
--     oder WhatsApp raus
-- =============================================================================


-- ###########################################################################
-- ## 0034 — Drehtage beim Kunden
-- ###########################################################################

-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0033.
--
-- Der Tag, an dem gedreht wird, ist nicht der Tag, an dem gepostet wird.
-- Bisher kannte ein Video nur das Posting-Datum -- der Drehtag stand
-- nirgends, obwohl er der Tag ist, an dem die eigentliche Arbeit passiert.
--
-- Drei Ergänzungen:
--
--   events.client_id       Ein Termin kann zu einem Kunden gehören.
--                          Leer = interner Termin ohne Kunden.
--
--   events.planned_videos  Bei einem Drehtag (kind='dreh'): wie viele Videos
--                          an dem Tag entstehen sollen. Das Ziel, an dem man
--                          sieht, ob noch etwas fehlt.
--
--   videos.shoot_event_id  An welchem Drehtag wird dieses Video gedreht?
--                          Unabhängig von scheduled_date, dem Posting-Tag --
--                          deshalb bleibt das Video auch im Board stehen, wo
--                          es hingehört.
--
--   videos.script          Das Drehskript. Steht am Video, nicht am Drehtag,
--                          damit es beim Drehen UND später noch da ist.
--
-- Gefahrlos und wiederholbar.
-- =============================================================================

alter table events add column if not exists client_id uuid references clients (id) on delete cascade;
alter table events add column if not exists planned_videos integer;

create index if not exists idx_events_client on events (client_id) where deleted_at is null;

alter table videos add column if not exists shoot_event_id uuid references events (id) on delete set null;
alter table videos add column if not exists script text;

create index if not exists idx_videos_shoot on videos (shoot_event_id) where deleted_at is null;


-- ###########################################################################
-- ## 0035 — Vertrag: Konditionen, PDF-Ablage, Versandprotokoll
-- ###########################################################################

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
