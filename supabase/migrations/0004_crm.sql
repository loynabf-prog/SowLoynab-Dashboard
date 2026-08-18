-- =============================================================================
-- 0004 — CRM-Ausbau: Leads, Aufgaben, Aktivitaeten, Finanzen
-- =============================================================================
-- Im Supabase SQL Editor einfuegen und "Run". Reihenfolge nach 0003.
-- Alles in einem Rutsch. RLS wie gehabt: nur eingeloggtes Team.
-- =============================================================================

-- --- Kunden: Paket + monatliches Honorar (fuer Einnahmen/MRR) ---------------
alter table clients add column if not exists package     text;
alter table clients add column if not exists monthly_fee numeric(10,2);
alter table clients add column if not exists active      boolean not null default true;

-- =============================================================================
-- Leads (Neukunden-Pipeline)
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type lead_stage as enum ('new', 'contacted', 'talking', 'offer', 'won', 'lost');
  end if;
end$$;

create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  contact_person     text,
  phone              text,
  email              text,
  handle_ig          text,
  website            text,
  city               text,
  stage              lead_stage not null default 'new',
  potential_fee      numeric(10,2),
  notes              text,
  next_followup      date,
  assigned_to        uuid references auth.users (id) on delete set null,
  converted_client_id uuid references clients (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads for each row execute function set_updated_at();

create index if not exists idx_leads_stage on leads (stage);

-- =============================================================================
-- Aufgaben / To-dos
-- =============================================================================
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  done         boolean not null default false,
  due_date     date,
  assigned_to  uuid references auth.users (id) on delete set null,
  client_id    uuid references clients (id) on delete cascade,
  lead_id      uuid references leads (id) on delete cascade,
  notes        text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks for each row execute function set_updated_at();

create index if not exists idx_tasks_done on tasks (done);
create index if not exists idx_tasks_due on tasks (due_date);

-- =============================================================================
-- Aktivitaeten (Verlauf/Notizen zu Lead oder Kunde)
-- =============================================================================
create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'note',   -- note | call | email | meeting
  body        text not null,
  client_id   uuid references clients (id) on delete cascade,
  lead_id     uuid references leads (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activities_lead on activities (lead_id);
create index if not exists idx_activities_client on activities (client_id);

-- =============================================================================
-- Finanzen (Geschaeftskonto): Einnahmen & Ausgaben
-- =============================================================================
create table if not exists transactions (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('income', 'expense')),
  amount       numeric(10,2) not null,
  description  text not null,
  category     text,                          -- z. B. Kunde, Software-Abo, Ausruestung
  client_id    uuid references clients (id) on delete set null,
  occurred_on  date not null default current_date,
  recurring    boolean not null default false, -- monatlich wiederkehrend?
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_transactions_date on transactions (occurred_on);
create index if not exists idx_transactions_type on transactions (type);

-- =============================================================================
-- Row-Level-Security fuer alle neuen Tabellen (nur eingeloggtes Team)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'tasks', 'activities', 'transactions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team_all_%1$s" on %1$I', t);
    execute format(
      'create policy "team_all_%1$s" on %1$I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end$$;

-- =============================================================================
-- Realtime fuer die neuen Tabellen
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'tasks', 'activities', 'transactions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;
