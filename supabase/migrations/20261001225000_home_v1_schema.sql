-- Home v1.1 entities for Deanly.
-- Apply name: home_v1_schema
-- Project: dpjzlitklsjtfrfrxvhl
--
-- An earlier remote migration named home_v1_entities was recorded empty.
-- Do not replay that name. Apply this file as home_v1_schema.
--
-- Visibility matches public.can_access_row: household members see shared rows,
-- and private rows only when owner_id = auth.uid(). Owners do not bypass visibility.

alter table public.user_preferences
  add column if not exists last_visibility public.visibility not null default 'shared';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_household_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id then
      raise exception 'Household cannot be reassigned.';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Owner cannot be reassigned.';
    end if;
    if new.visibility is distinct from old.visibility
       and old.owner_id is distinct from auth.uid() then
      raise exception 'Only the person who added this can change who sees it.';
    end if;
  end if;
  return new;
end;
$$;

-- Monthly household budget. Spend lives on expenses.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  period_month date not null,
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_period_is_month check (period_month = date_trunc('month', period_month)::date)
);

create unique index budgets_shared_month_uidx
  on public.budgets (household_id, period_month)
  where visibility = 'shared';

create unique index budgets_private_month_uidx
  on public.budgets (household_id, owner_id, period_month)
  where visibility = 'private';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  spent_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_household_spent_idx
  on public.expenses (household_id, spent_on);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  due_on date not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bills_household_due_idx
  on public.bills (household_id, due_on);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  target_cents integer not null check (target_cents > 0 and target_cents <= 100000000),
  current_cents integer not null default 0 check (current_cents >= 0 and current_cents <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  title text not null check (char_length(btrim(title)) between 1 and 140),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text check (location is null or char_length(location) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (ends_at is null or ends_at >= starts_at)
);

create index calendar_events_household_start_idx
  on public.calendar_events (household_id, starts_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  title text not null check (char_length(btrim(title)) between 1 and 160),
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_household_due_idx
  on public.tasks (household_id, due_on);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_household_updated_idx
  on public.notes (household_id, updated_at desc);

create table public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 180),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 26214400),
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vault_documents_household_created_idx
  on public.vault_documents (household_id, created_at desc);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  title text not null check (char_length(btrim(title)) between 1 and 140),
  meal_on date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_household_day_idx
  on public.meals (household_id, meal_on, slot);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 140),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_household_idx
  on public.shopping_items (household_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  renews_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Household feed. Private writes stay private: visibility + owner_id follow the source row.
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  summary text not null check (char_length(btrim(summary)) between 1 and 240),
  entity_type text not null check (entity_type in (
    'bill', 'task', 'note', 'event', 'meal', 'shopping', 'goal', 'budget', 'expense', 'vault', 'subscription'
  )),
  entity_id uuid,
  created_at timestamptz not null default now(),
  constraint activity_actor_is_owner check (actor_id = owner_id)
);

create index activity_events_household_created_idx
  on public.activity_events (household_id, created_at desc);

-- RLS: same shape on every household content table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'budgets',
    'expenses',
    'bills',
    'goals',
    'calendar_events',
    'tasks',
    'notes',
    'vault_documents',
    'meals',
    'shopping_items',
    'subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at',
      t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_protect', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.protect_household_row()',
      t || '_protect',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_row(household_id, visibility, owner_id))',
      t || '_select',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_household_member(household_id) and owner_id = auth.uid())',
      t || '_insert',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_row(household_id, visibility, owner_id)) with check (public.is_household_member(household_id) and (visibility = ''shared'' or owner_id = auth.uid()))',
      t || '_update',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_row(household_id, visibility, owner_id))',
      t || '_delete',
      t
    );
  end loop;
end $$;

alter table public.activity_events enable row level security;
grant select, insert, delete on public.activity_events to authenticated;

create policy activity_events_select
  on public.activity_events
  for select to authenticated
  using (public.can_access_row(household_id, visibility, owner_id));

create policy activity_events_insert
  on public.activity_events
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and owner_id = auth.uid()
    and actor_id = auth.uid()
  );

create policy activity_events_delete
  on public.activity_events
  for delete to authenticated
  using (actor_id = auth.uid());

-- Private vault bucket. Path: {household_id}/{shared|private}/{user_id}/{document_id}/{filename}
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400;

create policy vault_objects_select
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = 'shared'
      or ((storage.foldername(name))[3])::uuid = auth.uid()
    )
  );

create policy vault_objects_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] in ('shared', 'private')
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
    and ((storage.foldername(name))[3])::uuid = auth.uid()
  );

create policy vault_objects_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = 'shared'
      or ((storage.foldername(name))[3])::uuid = auth.uid()
    )
  );
