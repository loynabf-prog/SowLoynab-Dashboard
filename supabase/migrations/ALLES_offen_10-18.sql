-- =============================================================================
-- ALLES OFFEN 10–18  —  Ein Skript, alles auf den neuesten Stand
-- =============================================================================
-- Einfach komplett markieren und im Supabase SQL Editor "Run" drücken.
--
-- Sicher wiederholbar: Alles ist mit "if not exists" / "create or replace"
-- gebaut. Was schon in deiner Datenbank ist, wird übersprungen — es kann also
-- NICHTS kaputtgehen, egal welche Skripte du vorher schon eingespielt hast.
--
-- Enthält: 0010 Freigabe-Links · 0011 Auto-Statistik · 0012 Rechnungen/PDF ·
--          0013 Postfach · 0014 Systemstatus · 0015 Serien · 0016 Aufgaben-
--          Farben · 0017 Video-Farbring · 0018 Dringlichkeit
-- =============================================================================

-- --- Sicherheits-Vorspann: Spalten aus Skript 7, die 0010 braucht ----------
alter table videos add column if not exists approval_status text not null default 'none';
alter table videos add column if not exists approval_note   text;
alter table videos add column if not exists approved_at     timestamptz;
alter table videos add column if not exists share_token     uuid not null default gen_random_uuid();


-- ###########################################################################
-- ##  0010_approval
-- ###########################################################################
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


-- ###########################################################################
-- ##  0011_live_stats
-- ###########################################################################
-- =============================================================================
-- 0011 — Live-Links pro Video (für die automatische Statistik)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0010.
--
-- Nach dem Posten hinterlegst du beim Video den TikTok- und/oder Instagram-Link.
-- Ein täglicher Job (Edge Function "refresh-stats") liest darüber automatisch
-- Views/Likes/Kommentare/Shares aus und schreibt sie ins Video + in die
-- Verlaufs-Tabelle video_stats (die es schon gibt).
-- =============================================================================

alter table videos add column if not exists tiktok_url      text;
alter table videos add column if not exists instagram_url   text;
alter table videos add column if not exists stats_updated_at timestamptz;


-- ###########################################################################
-- ##  0012_invoice_pdf
-- ###########################################################################
-- =============================================================================
-- 0012 — Felder für echte PDF-Rechnungen
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0011.
--
-- Ergänzt die Rechnungen um alles, was eine ordentliche deutsche Rechnung
-- braucht: Empfänger-Adresse, USt-Satz, Leistungszeitraum, optionale Positionen.
-- Die Absender-/Firmendaten liegen in app_settings (kein neues Feld nötig).
-- =============================================================================

alter table invoices add column if not exists recipient      text;           -- Rechnungsempfänger (mehrzeilige Adresse)
alter table invoices add column if not exists service_period text;           -- Leistungszeitraum / -datum
alter table invoices add column if not exists vat_rate       numeric(5,2) default 0;  -- 0 = Kleinunternehmer, sonst z. B. 19
alter table invoices add column if not exists items          jsonb;          -- optionale Positionen [{desc, qty, price}]


-- ###########################################################################
-- ##  0013_mail
-- ###########################################################################
-- =============================================================================
-- 0013 — Postfach (E-Mail im Dashboard, angebunden an Zoho Mail)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0012.
--
-- Speichert eingehende Mails, die die Edge-Function "mail-sync" aus Zoho holt.
-- Das Frontend liest ausschließlich aus dieser Tabelle (schnell, offline-fähig,
-- Realtime). Versendete Rechnungen laufen über "mail-send" direkt über Zoho —
-- die landen automatisch in eurem Zoho-"Gesendet"-Ordner.
-- =============================================================================

create table if not exists mails (
  id              uuid primary key default gen_random_uuid(),
  zoho_message_id text unique,                 -- Zoho messageId (verhindert Doppel-Import)
  folder          text default 'Inbox',
  from_address    text,
  from_name       text,
  to_address      text,
  subject         text,
  snippet         text,                        -- Kurzvorschau
  body_html       text,                        -- voller Inhalt (im Postfach angezeigt)
  received_at     timestamptz,
  is_read         boolean default false,
  archived        boolean default false,
  created_at      timestamptz default now()
);

create index if not exists mails_received_idx on mails (received_at desc);
create index if not exists mails_unread_idx   on mails (is_read) where is_read = false;

-- RLS + Realtime (nur eingeloggtes Team) — gleiche Logik wie 0006
alter table mails enable row level security;
drop policy if exists "team_all_mails" on mails;
create policy "team_all_mails" on mails for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mails'
  ) then
    execute 'alter publication supabase_realtime add table mails';
  end if;
end $$;


-- ###########################################################################
-- ##  0014_system_status
-- ###########################################################################
-- =============================================================================
-- 0014 — Systemstatus (macht stille Hintergrund-Fehler sichtbar)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0013.
--
-- Die Cron-Funktionen (mail-sync, refresh-stats) schreiben hier ihren letzten
-- Erfolg bzw. Fehler rein. Die App zeigt das unter Einstellungen an — so merkst
-- du sofort, wenn z. B. der Mail-Abruf seit Stunden klemmt.
-- =============================================================================

create table if not exists system_status (
  job           text primary key,
  last_ok       timestamptz,
  last_error    text,
  last_error_at timestamptz,
  detail        text,
  updated_at    timestamptz not null default now()
);

alter table system_status enable row level security;
drop policy if exists "team_read_status" on system_status;
-- Nur lesen fürs eingeloggte Team; geschrieben wird per Service-Role (Cron-Funktionen)
create policy "team_read_status" on system_status for select
  using (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'system_status'
  ) then
    execute 'alter publication supabase_realtime add table system_status';
  end if;
end $$;


-- ###########################################################################
-- ##  0015_series
-- ###########################################################################
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


-- ###########################################################################
-- ##  0016_task_category
-- ###########################################################################
-- =============================================================================
-- 0016 — Farb-Kategorien für Aufgaben
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0015.
--
-- Speichert pro Aufgabe eine Kategorie-Kennung (z. B. "dreh", "schnitt").
-- Die Kategorien selbst (Name + Farbe) liegen frei wählbar in app_settings
-- (kein zusätzliches Feld nötig) und sind in den Einstellungen anpassbar.
-- =============================================================================

alter table tasks add column if not exists category text;


-- ###########################################################################
-- ##  0017_video_category
-- ###########################################################################
-- =============================================================================
-- 0017 — Farb-Kategorie für Videos (farbiger Ring ums Logo im Kalender)
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0016.
--
-- Dieselben frei wählbaren Kategorien wie bei Aufgaben (aus app_settings) –
-- ein Video kann so z. B. rot markiert werden ("dringend / Dreh").
-- =============================================================================

alter table videos add column if not exists category text;


-- ###########################################################################
-- ##  0018_task_priority
-- ###########################################################################
-- =============================================================================
-- 0018 — Dringlichkeit / Priorität für Aufgaben
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0017.
--
-- 3 = dringend (rot), 2 = wichtig (gelb), 1 = kann warten (grün), 0 = ohne.
-- Erlaubt ein Aufgaben-Dashboard nach Rangordnung (unabhängig vom Datum).
-- =============================================================================

alter table tasks add column if not exists priority smallint not null default 0;

create index if not exists tasks_priority_idx on tasks (priority desc) where priority > 0;

