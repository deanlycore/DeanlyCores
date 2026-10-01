-- Deanly — DeanFamily
-- Baseline already applied on the linked Supabase project as
-- version 20261001204003 (foundation_household_rls).
-- Kept here so a fresh database matches that project. Do not re-apply it there.

create type public.member_role as enum ('owner', 'member');
create type public.visibility as enum ('shared', 'private');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'DeanFamily',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  currency text not null default 'USD',
  appearance text not null default 'light',
  notification_prefs jsonb not null default '{}'::jsonb,
  dashboard_layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null default 'expense',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
  );
$$;

-- Shared rows: any household member. Private rows: the owner only.
-- Future tables should store household_id, visibility, and owner_id,
-- then call this from RLS. Bills and calendar default to shared.
-- Personal notes default to private.
create or replace function public.can_access_row(
  p_household_id uuid,
  p_visibility public.visibility,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_household_member(p_household_id)
    and (
      p_visibility = 'shared'
      or p_owner_id = auth.uid()
    );
$$;

create or replace function public.seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cats text[] := array[
    'Housing','Utilities','Internet','Phone','Groceries','Restaurants',
    'Transportation','Gas','Car','Insurance','Medical','Pets',
    'Entertainment','Subscriptions','Shopping','Personal','Savings','Debt','Other'
  ];
  i int;
begin
  for i in 1..array_length(cats, 1) loop
    insert into public.categories (household_id, name, kind, sort_order)
    values (p_household_id, cats[i], 'expense', i)
    on conflict (household_id, name) do nothing;
  end loop;
end;
$$;

-- display_name is copied once from signup metadata. It is not used for access control.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.user_preferences enable row level security;
alter table public.categories enable row level security;

create policy profiles_select_self_or_household on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_members me
      join public.household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy households_insert_authenticated on public.households
  for insert to authenticated
  with check (true);

create policy households_select_member on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update_member on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy household_members_insert on public.household_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_household_member(household_id));

create policy household_members_delete_self_or_owner on public.household_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'owner'
    )
  );

create policy user_preferences_all_self on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy categories_select_member on public.categories
  for select to authenticated
  using (public.is_household_member(household_id));

create policy categories_write_member on public.categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
