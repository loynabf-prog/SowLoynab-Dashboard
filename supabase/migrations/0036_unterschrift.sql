-- =============================================================================
-- 0036 — Unterschrift zum Draufschreiben
-- =============================================================================
-- Einmalig im Supabase SQL Editor "Run". Reihenfolge nach 0035.
--
-- Bisher hat der Kunde seinen Namen getippt. Jetzt kann er mit dem Finger
-- unterschreiben -- entweder auf seinem eigenen Handy ueber den Link, oder
-- direkt auf unserem Geraet, wenn wir vor Ort sitzen.
--
-- Rechtlich aendert das nichts: beides ist eine EINFACHE elektronische
-- Signatur. Fuer Dienstvertraege wie unsere reicht das, sie sind formfrei.
-- Der gezeichnete Zug ist aber das, was ein Kunde als "unterschrieben"
-- empfindet -- und er steht mit im PDF.
-- =============================================================================

-- Die Unterschrift als PNG (Data-URL). Klein gehalten: das Feld zeichnet mit
-- fester Aufloesung, es landen ein paar Kilobyte in der Zeile.
alter table contracts add column if not exists signer_signature text;

comment on column contracts.signer_signature is
  'Gezeichnete Unterschrift als PNG-Data-URL. Leer = nur Name getippt.';

-- --- Unterschreiben mit Unterschrift ----------------------------------------
-- BEWUSST eine zweite Fassung mit vier Argumenten statt eines Standardwerts:
-- so bleibt die alte dreistellige Fassung gueltig und es gibt keinen Moment,
-- in dem die ausgelieferte App ins Leere laeuft. Postgres unterscheidet die
-- beiden an der Anzahl der Argumente, eine Zweideutigkeit entsteht nicht.
create or replace function public.sign_contract(t uuid, name text, role text, signature text)
returns void
language sql
security definer
set search_path = public
as $$
  update contracts
     set status           = 'signed',
         signed_at        = now(),
         signer_name      = nullif(btrim(coalesce(name, '')), ''),
         signer_role      = nullif(btrim(coalesce(role, '')), ''),
         signer_signature = nullif(btrim(coalesce(signature, '')), '')
   where token = t
     and deleted_at is null
     and status = 'sent'
     and btrim(coalesce(name, '')) <> ''
$$;

grant execute on function public.sign_contract(uuid, text, text, text) to anon, authenticated;

-- --- Die Unterschrift muss auch oeffentlich lesbar sein ----------------------
-- Sonst sieht der Kunde sie nach dem Unterschreiben auf seiner eigenen Seite
-- nicht und bekaeme ein PDF ohne seinen eigenen Zug.
--
-- Hier muss "drop" davor: die Funktion bekommt zwei Spalten mehr, und einen
-- geaenderten Rueckgabetyp laesst Postgres mit "create or replace" nicht zu.
drop function if exists public.get_contract_by_token(uuid);

create function public.get_contract_by_token(t uuid)
returns table (
  id               uuid,
  title            text,
  body             jsonb,
  status           text,
  signed_at        timestamptz,
  signer_name      text,
  signer_role      text,
  signer_signature text,
  starts_on        date,
  client_name      text
)
language sql
security definer
set search_path = public
as $$
  select k.id, k.title, k.body, k.status, k.signed_at, k.signer_name,
         k.signer_role, k.signer_signature, k.starts_on, c.name
  from contracts k
  join clients c on c.id = k.client_id
  where k.token = t
    and k.deleted_at is null
    and k.status in ('sent', 'signed')
$$;

grant execute on function public.get_contract_by_token(uuid) to anon, authenticated;
