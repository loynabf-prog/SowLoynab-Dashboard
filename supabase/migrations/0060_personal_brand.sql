-- 0060 Personal Brand
-- Unsere eigenen Accounts (Agentur + private von Fassie und Lion) sind kein
-- Kunde mehr, sondern ein eigener Bereich: clients.client_type = 'eigen',
-- die Accounts als Kanaele (client_channels) darunter.
-- Leads merken sich, ueber welchen dieser Accounts sie reinkamen, damit man
-- spaeter sieht, wo die meisten Anfragen herkommen (auch fuer Ads).
-- Additiv und wiederholbar.

alter table leads add column if not exists quelle_kanal_id uuid
  references client_channels(id) on delete set null;

create index if not exists idx_leads_quelle_kanal on leads (quelle_kanal_id);

comment on column leads.quelle_kanal_id is
  'Personal-Brand-Account (client_channels der Kundenart eigen), ueber den der Lead kam';
comment on column clients.client_type is
  'zahlend | eigen (Personal Brand) | referenz (Ehrenamt) | passiv';
