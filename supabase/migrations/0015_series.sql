-- =============================================================================
-- 0015 — Serien-Kennung für wiederkehrende Aufgaben & Videos
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0014.
--
-- Wiederkehrende Einträge (alle N Tage / wöchentlich / monatlich) werden als
-- echte Einzel-Einträge angelegt, die dieselbe series_id teilen. So funktionieren
-- Board, Kalender, „Heute" & Statistik unverändert — und man kann eine ganze
-- Serie auf einmal löschen.
-- =============================================================================

alter table tasks  add column if not exists series_id uuid;
alter table videos add column if not exists series_id uuid;

create index if not exists tasks_series_idx  on tasks (series_id)  where series_id is not null;
create index if not exists videos_series_idx on videos (series_id) where series_id is not null;
