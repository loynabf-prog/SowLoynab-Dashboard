-- 0086: Wann wurde eine Aufgabe erledigt (fuer "Heute erledigt" auf dem Fernseher). Eingespielt 24.11.2026.
alter table public.tasks add column if not exists done_at timestamptz;
create or replace function public.tasks_done_at_setzen() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.done and not coalesce(old.done, false) then new.done_at := now();
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_done_at on public.tasks;
create trigger tasks_done_at before update of done on public.tasks
  for each row execute function public.tasks_done_at_setzen();
create or replace function public.tasks_done_at_neu() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.done then new.done_at := coalesce(new.done_at, now()); end if;
  return new;
end $$;
drop trigger if exists tasks_done_at_ins on public.tasks;
create trigger tasks_done_at_ins before insert on public.tasks
  for each row execute function public.tasks_done_at_neu();
