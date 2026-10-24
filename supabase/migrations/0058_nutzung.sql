-- 0058: Nutzung messen -- welche Seiten wie oft und wie lange offen sind
-- ---------------------------------------------------------------------------
-- Fassie (24.10.2026): "Was wir mehr benutzen, soll nach oben, was wir
-- weniger benutzen, nach hinten." Dafuer schreibt die App bei jedem
-- Seitenwechsel eine Zeile: wer, welche Seite, wie lange. Claude wertet das
-- nach einer Woche / einem Monat aus und sortiert die Navigation danach.
-- Kundenseiten werden als "/client" zusammengefasst (kein Pfad pro Kunde).

create table if not exists public.seitenaufrufe (
  id          bigint generated always as identity primary key,
  member_id   uuid references public.team_members(id) on delete set null,
  pfad        text not null,                  -- '/plan', '/client', '/mehr' ...
  von         text,                           -- Seite davor
  dauer_s     integer,                        -- wie lange offen (Sekunden)
  geraet      text,                           -- 'handy' | 'desktop'
  at          timestamptz not null default now()
);

create index if not exists seitenaufrufe_at_idx on public.seitenaufrufe (at desc);
create index if not exists seitenaufrufe_pfad_idx on public.seitenaufrufe (pfad);

alter table public.seitenaufrufe enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'seitenaufrufe' and policyname = 'team_all_seitenaufrufe') then
    create policy "team_all_seitenaufrufe" on public.seitenaufrufe
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Auswertung: je Seite Aufrufe, Minuten, letzter Besuch -- fuer Claude und
-- die Einstellungen ("Nutzung").
create or replace view public.nutzung_je_seite
with (security_invoker = true) as
select
  pfad,
  count(*)                                    as aufrufe,
  count(*) filter (where at > now() - interval '7 days')  as aufrufe_7t,
  count(*) filter (where at > now() - interval '30 days') as aufrufe_30t,
  round(coalesce(sum(dauer_s), 0) / 60.0)     as minuten,
  round(coalesce(sum(dauer_s) filter (where at > now() - interval '30 days'), 0) / 60.0) as minuten_30t,
  max(at)                                     as zuletzt
from public.seitenaufrufe
group by pfad
order by aufrufe_30t desc, aufrufe desc;

grant select on public.nutzung_je_seite to authenticated;
