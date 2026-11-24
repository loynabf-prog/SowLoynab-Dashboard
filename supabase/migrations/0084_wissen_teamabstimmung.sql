-- 0084: Gemeinsames Wissen fuer beide Claudes + Abstimmung, wer woran arbeitet
-- (bereits per apply_migration eingespielt am 24.11.2026)

-- 1) Second Brain
create table if not exists public.wissen (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  kategorie text not null default 'learning'
    check (kategorie in ('kunde','learning','format','entscheidung','ablauf','sonstiges')),
  titel text not null,
  inhalt text not null default '',
  tags text[] not null default '{}',
  autor_id uuid references public.team_members(id) on delete set null,
  geaendert_von uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists wissen_client_idx on public.wissen(client_id) where deleted_at is null;
create index if not exists wissen_kategorie_idx on public.wissen(kategorie) where deleted_at is null;

create table if not exists public.wissen_verlauf (
  id bigint generated always as identity primary key,
  wissen_id uuid not null references public.wissen(id) on delete cascade,
  aktion text not null,
  titel text,
  inhalt text,
  geaendert_von uuid references public.team_members(id) on delete set null,
  geaendert_am timestamptz not null default now()
);

create or replace function public.wissen_verlauf_schreiben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  insert into public.wissen_verlauf (wissen_id, aktion, titel, inhalt, geaendert_von)
  values (new.id,
          case when tg_op = 'INSERT' then 'angelegt'
               when new.deleted_at is not null and old.deleted_at is null then 'geloescht'
               else 'geaendert' end,
          new.titel, new.inhalt, coalesce(new.geaendert_von, new.autor_id));
  return new;
end $$;

drop trigger if exists wissen_verlauf_ins on public.wissen;
create trigger wissen_verlauf_ins after insert on public.wissen
  for each row execute function public.wissen_verlauf_schreiben();
drop trigger if exists wissen_verlauf_upd on public.wissen;
create trigger wissen_verlauf_upd before update on public.wissen
  for each row execute function public.wissen_verlauf_schreiben();

alter table public.wissen enable row level security;
alter table public.wissen_verlauf enable row level security;
drop policy if exists team_all_wissen on public.wissen;
create policy team_all_wissen on public.wissen for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists team_read_wissen_verlauf on public.wissen_verlauf;
create policy team_read_wissen_verlauf on public.wissen_verlauf for select
  using (auth.role() = 'authenticated');

-- 2) Team-Log: wer hat was gemacht
create table if not exists public.team_log (
  id bigint generated always as identity primary key,
  wer uuid references public.team_members(id) on delete set null,
  was text not null,
  client_id uuid references public.clients(id) on delete set null,
  video_id uuid references public.videos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_log_zeit_idx on public.team_log(created_at desc);
alter table public.team_log enable row level security;
drop policy if exists team_all_team_log on public.team_log;
create policy team_all_team_log on public.team_log for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 3) Video-Belegung: wer arbeitet gerade woran
alter table public.videos
  add column if not exists in_arbeit_seit timestamptz,
  add column if not exists in_arbeit_was text;

-- Atomar belegen: gelingt nur, wenn frei, schon eigenes oder Belegung aelter als 12 h
create or replace function public.video_belegen(p_video uuid, p_wer uuid, p_was text)
returns table (ok boolean, belegt_von text, belegt_seit timestamptz, belegt_was text)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.videos
     set bearbeiter_id = p_wer, in_arbeit_seit = now(), in_arbeit_was = p_was
   where id = p_video
     and (bearbeiter_id is null or bearbeiter_id = p_wer
          or in_arbeit_seit is null or in_arbeit_seit < now() - interval '12 hours');
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.team_log (wer, was, client_id, video_id)
      select p_wer, 'beginnt: ' || p_was || ' – ' || v.title, v.client_id, v.id
        from public.videos v where v.id = p_video;
  end if;
  return query
    select n > 0, t.name, v.in_arbeit_seit, v.in_arbeit_was
      from public.videos v left join public.team_members t on t.id = v.bearbeiter_id
     where v.id = p_video;
end $$;

-- Freigeben, wenn fertig (bearbeiter_id bleibt als "zuletzt bearbeitet von")
create or replace function public.video_freigeben(p_video uuid, p_wer uuid, p_ergebnis text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.videos set in_arbeit_seit = null, in_arbeit_was = null where id = p_video;
  insert into public.team_log (wer, was, client_id, video_id)
    select p_wer, 'fertig: ' || coalesce(p_ergebnis, 'erledigt') || ' – ' || v.title, v.client_id, v.id
      from public.videos v where v.id = p_video;
end $$;

revoke all on function public.video_belegen(uuid, uuid, text) from anon;
revoke all on function public.video_freigeben(uuid, uuid, text) from anon;
