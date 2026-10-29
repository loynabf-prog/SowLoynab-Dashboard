-- 0070: Agentur-Dokumente -- Gewerbeanmeldung, Steuerbescheide, Vertraege,
-- Versicherung ... als Datei im CRM, damit man sie findet, wenn man sie sucht.
-- (Fassie, 29.10.2026: "die Gewerbeanmeldung habe ich jetzt gescannt, die will
-- ich da hinterlegen"). Datei liegt im privaten Bucket "dokumente", die Zeile
-- hier traegt Titel, Kategorie, Notiz -- und ist ueber die Suche (Cmd+K) findbar.

create table if not exists dokumente (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  kategorie text not null default 'sonstiges',
  dateiname text not null,
  pfad text not null,
  mime text,
  groesse bigint,
  notiz text,
  gueltig_bis date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table dokumente enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'dokumente' and policyname = 'team_alles') then
    create policy team_alles on dokumente for all using (true) with check (true);
  end if;
end $$;
grant all on dokumente to anon, authenticated, service_role;

insert into storage.buckets (id, name, public) values ('dokumente', 'dokumente', false) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'dokumente_team_read') then
    create policy dokumente_team_read on storage.objects for select using (bucket_id = 'dokumente' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'dokumente_team_insert') then
    create policy dokumente_team_insert on storage.objects for insert with check (bucket_id = 'dokumente' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'dokumente_team_update') then
    create policy dokumente_team_update on storage.objects for update using (bucket_id = 'dokumente' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'dokumente_team_delete') then
    create policy dokumente_team_delete on storage.objects for delete using (bucket_id = 'dokumente' and auth.role() = 'authenticated');
  end if;
end $$;
