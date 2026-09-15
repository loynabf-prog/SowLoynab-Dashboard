-- =============================================================================
-- NOTFALL — "Wo sind meine Videos?"
-- =============================================================================
-- Direkt im Supabase SQL Editor ausführen. Umgeht die App komplett: kein
-- Deploy, kein Zwischenspeicher, keine Anzeige die lügen könnte.
--
-- Drei Schritte. SCHRITT 1 zuerst und allein — der ändert nichts, der schaut
-- nur. Was danach zu tun ist, entscheidest du anhand des Ergebnisses.
-- =============================================================================


-- =============================================================================
-- SCHRITT 1 — NACHSEHEN (ändert nichts)
-- =============================================================================
-- Markieren, "Run". Zeigt jeden Kunden und wie viele Videos an ihm hängen.
-- Ganz oben steht der mit den meisten. Da sind sie.

select
  c.name                                                as kunde,
  case when c.deleted_at is null
       then 'aktiv' else 'PAPIERKORB' end               as status,
  count(v.id) filter (where v.deleted_at is null)       as videos,
  count(v.id) filter (where v.deleted_at is not null)   as videos_im_papierkorb,
  c.id                                                  as kunden_id
from clients c
left join videos v on v.client_id = c.id
group by c.id, c.name, c.deleted_at
order by videos desc, kunde;


-- Und zur Kontrolle: wie viele Videos gibt es insgesamt?
-- Wenn hier eine vernünftige Zahl steht, ist nichts verloren gegangen.
select
  count(*) filter (where deleted_at is null)     as videos_aktiv,
  count(*) filter (where deleted_at is not null) as videos_im_papierkorb,
  count(*)                                      as videos_gesamt
from videos;


-- =============================================================================
-- SCHRITT 2 — ZUSAMMENFÜHREN
-- =============================================================================
-- Aus Schritt 1 die beiden "kunden_id" heraussuchen und unten eintragen:
--
--   quelle = der Kunde, bei dem die Videos JETZT hängen
--   ziel   = der Kunde, bei dem sie HINSOLLEN
--
-- Die IDs sind lange Zeichenketten wie 'a1b2c3d4-....'. Die Anführungszeichen
-- stehen lassen, nur das Innere ersetzen.
--
-- Der ganze Block läuft als EINE Einheit: geht irgendetwas schief, wird alles
-- zurückgedreht und nichts ist verändert. Es kann also nichts halb passieren.
--
-- Nach dem Lauf unten im Editor auf "Messages" schauen — dort steht Zeile für
-- Zeile, was umgezogen ist.

do $$
declare
  quelle uuid := 'HIER-DIE-QUELL-ID-EINSETZEN';
  ziel   uuid := 'HIER-DIE-ZIEL-ID-EINSETZEN';
  t      text;
  n      integer;
  gesamt integer := 0;
begin
  if quelle = ziel then
    raise exception 'Quelle und Ziel sind derselbe Kunde — nichts zu tun.';
  end if;
  if not exists (select 1 from clients where id = quelle) then
    raise exception 'Quell-Kunde % existiert nicht. ID aus Schritt 1 prüfen.', quelle;
  end if;
  if not exists (select 1 from clients where id = ziel) then
    raise exception 'Ziel-Kunde % existiert nicht. ID aus Schritt 1 prüfen.', ziel;
  end if;

  -- Follower-Tage, die es beim Ziel schon gibt, beim Quell-Kunden entfernen.
  -- Sonst blockiert der Eindeutigkeits-Index (ein Eintrag je Kunde und Tag)
  -- den ganzen Umzug. Betrifft nur Tage, an denen BEIDE Kunden eine Zahl
  -- haben -- beim leeren Ziel-Kunden also gar keinen.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'client_stats'
       and column_name = 'client_id'
  ) then
    delete from client_stats q
     where q.client_id = quelle
       and exists (
         select 1 from client_stats z
          where z.client_id = ziel and z.captured_on = q.captured_on
       );
  end if;

  -- Alles umhängen, was per client_id am Kunden hängt. Tabellen, die es in
  -- dieser Datenbank nicht gibt, werden übersprungen statt zu scheitern.
  foreach t in array array[
    'videos', 'video_ideas', 'inspirations', 'tasks', 'activities',
    'transactions', 'attachments', 'contacts', 'invoices', 'client_assets',
    'content_pillars', 'time_entries', 'contracts', 'client_accounts',
    'client_stats'
  ] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t
         and column_name = 'client_id'
    ) then
      execute format('update %I set client_id = $1 where client_id = $2', t)
        using ziel, quelle;
      get diagnostics n = row_count;
      if n > 0 then
        raise notice '%: % Zeilen umgezogen', t, n;
        gesamt := gesamt + n;
      end if;
    end if;
  end loop;

  -- Leads, die zu diesem Kunden geworden sind, zeigen künftig aufs Ziel
  update leads set converted_client_id = ziel where converted_client_id = quelle;

  -- Der leergeräumte Kunde wandert in den Papierkorb (nicht gelöscht --
  -- Schritt 3 holt ihn jederzeit zurück).
  update clients set deleted_at = now() where id = quelle and deleted_at is null;

  raise notice '--- Fertig: % Zeilen insgesamt umgezogen. ---', gesamt;
end$$;


-- Danach Schritt 1 nochmal laufen lassen: beim Ziel-Kunden muss jetzt die
-- volle Videozahl stehen.


-- =============================================================================
-- SCHRITT 3 — RÜCKGÄNGIG: einen Kunden aus dem Papierkorb holen
-- =============================================================================
-- Holt einen gelöschten Kunden zurück in die Kundenliste. Ändert nichts an
-- den Videos -- die hängen da, wo sie hängen.
--
-- ID eintragen, dann die Zeile markieren und "Run".

-- update clients set deleted_at = null where id = 'HIER-DIE-KUNDEN-ID';


-- =============================================================================
-- Was NICHT geht
-- =============================================================================
-- Ein Zusammenlegen lässt sich nicht automatisch wieder aufteilen. Sobald die
-- Videos umgezogen sind, steht nirgends geschrieben, von welchem der beiden
-- Kunden jedes einzelne ursprünglich kam. Den Kunden zurückholen: ja
-- (Schritt 3). Die Videos automatisch wieder aufteilen: nein.
--
-- Falls das doch nötig wird, führt der Weg über die Sicherung der Datenbank
-- selbst: Supabase -> Project Settings -> Database -> Backups. Was dort zur
-- Verfügung steht, hängt vom Tarif ab -- im kostenlosen Tarif gibt es keine
-- tägliche Sicherung.
