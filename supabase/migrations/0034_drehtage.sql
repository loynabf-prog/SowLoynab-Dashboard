-- =============================================================================
-- 0034 — Drehtage: Termine am Kunden, Videos am Drehtag, Skript am Video
-- =============================================================================
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
