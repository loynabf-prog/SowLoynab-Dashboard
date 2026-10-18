-- =============================================================================
-- 0039 — Aufraeumen: tote Schnittstellen zu, Trigger-Funktion abdichten
-- =============================================================================
-- Gefunden bei der Fehleranalyse mit dem Supabase-Sicherheitspruefer.
-- Nichts davon war kaputt im Sinne von "geht nicht" -- es war Angriffsflaeche
-- ohne Gegenwert. Alles idempotent, ein zweiter Durchlauf schadet nicht.
--
-- NICHT angefasst:
--   * dropbox_verbindung hat RLS an und KEINE Policy. Das ist Absicht: dort
--     liegt der Dropbox-Refresh-Token, und nur die Edge Function mit
--     Service-Role-Rechten darf ran. Kein Fehler.
--   * get_contract_by_token / sign_contract bleiben fuer anon offen -- das
--     IST das Vertragsportal.
-- =============================================================================

-- --- 1) Reste der alten Kunden-Freigabe -------------------------------------
-- Die Freigabe-Seite (/freigabe/<token>) wurde beim Abspecken entfernt. Die
-- beiden Funktionen dazu blieben liegen und waren weiterhin OHNE LOGIN
-- aufrufbar: get_video_by_token gab zu jedem geratenen Token Videodaten
-- heraus, set_video_approval durfte sogar schreiben. Niemand ruft sie mehr.
drop function if exists public.get_video_by_token(uuid);
drop function if exists public.set_video_approval(uuid, text, text);

-- --- 2) Trigger-Funktion gehoert nicht in die oeffentliche Schnittstelle ----
-- sync_client_handles() haengt als Trigger an client_accounts und spiegelt
-- den ersten Account zurueck in clients. Als SECURITY DEFINER war sie
-- zusaetzlich ueber /rest/v1/rpc/ aufrufbar -- auch ohne Login. Trigger
-- brauchen das nicht: Postgres ruft sie selbst auf.
revoke execute on function public.sync_client_handles() from anon, authenticated, public;

-- --- 3) Fester Suchpfad fuer die Zeitstempel-Funktion -----------------------
-- Ohne festen search_path entscheidet die Rolle des Aufrufers, welche
-- Tabellen gemeint sind. Bei einer Funktion, die mit erhoehten Rechten
-- laeuft, ist das der klassische Hebel zum Unterschieben eigener Objekte.
alter function public.set_updated_at() set search_path = public, pg_temp;
