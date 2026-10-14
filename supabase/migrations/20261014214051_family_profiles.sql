-- Family profiles are people in the household. They are not logins.
-- household_members stays the login list. This table does not join auth.users.
--
-- households.owner_id is the login allowed to insert or update a profile.
-- It is backfilled from the earliest owner membership (user id breaks a tie).
-- When a household has two owner memberships, only that earliest owner can edit Family.

alter table public.households
  add column owner_id uuid references auth.users (id);

update public.households as home
set owner_id = (
  select members.user_id
  from public.household_members as members
  where members.household_id = home.id
    and members.role = 'owner'
  order by members.created_at, members.user_id
  limit 1
)
where home.owner_id is null;

-- Fail here, before set not null, so a household with no owner membership
-- stops the migration with a count instead of a generic not-null error.
do $$
declare
  missing integer;
begin
  select count(*)::integer
    into missing
  from public.households as home
  where not exists (
    select 1
    from public.household_members as members
    where members.household_id = home.id
      and members.role = 'owner'
  );

  if missing > 0 then
    raise exception
      'Cannot require households.owner_id: % household(s) have no owner membership.',
      missing;
  end if;
end;
$$;

alter table public.households
  alter column owner_id set not null;

alter table public.households
  alter column owner_id set default auth.uid();

create index households_owner_id_idx
  on public.households (owner_id);

-- Direct inserts must name the caller as owner. A client cannot pass someone else's id.
create policy households_insert_self
  on public.households
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create or replace function public.protect_household_owner_id()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Household owner cannot be reassigned.';
  end if;
  return new;
end;
$$;

create trigger households_protect_owner_id
  before update on public.households
  for each row execute function public.protect_household_owner_id();

revoke all on function public.protect_household_owner_id() from public, anon, authenticated, service_role;
grant execute on function public.protect_household_owner_id() to authenticated;

create table public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  role text,
  birthday date,
  color text not null default 'teal',
  notes text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint family_profiles_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint family_profiles_role_length check (role is null or char_length(role) between 1 and 80),
  constraint family_profiles_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint family_profiles_color_check check (
    color in ('teal', 'deep', 'sand', 'success', 'warn', 'ink')
  )
);

comment on table public.family_profiles is
  'Household people without logins. Separate from household_members.';

comment on column public.family_profiles.household_id is
  'Set on insert by assign_family_profile_household. Not chosen by the client.';

create index family_profiles_household_id_idx
  on public.family_profiles (household_id);

-- Insert ignores a client household_id and stores the caller's active household:
-- the same membership lookup the app uses (user_id = auth.uid(), limit 1),
-- not the oldest household they own. The caller must own that household.
-- Update raises when household_id changes. The update policy must not read
-- family_profiles to enforce that, or row level security recurses (42P17).
create or replace function public.assign_family_profile_household()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  active uuid;
begin
  if tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id then
      raise exception 'Household cannot be reassigned.';
    end if;
    return new;
  end if;

  select members.household_id
    into active
  from public.household_members as members
  where members.user_id = auth.uid()
  limit 1;

  if active is null or not exists (
    select 1
    from public.households
    where households.id = active
      and households.owner_id = auth.uid()
  ) then
    raise exception 'Only the household owner can add a family member.';
  end if;

  new.household_id := active;
  return new;
end;
$$;

create trigger family_profiles_assign_household
  before insert or update on public.family_profiles
  for each row execute function public.assign_family_profile_household();

revoke all on function public.assign_family_profile_household() from public, anon, authenticated, service_role;
grant execute on function public.assign_family_profile_household() to authenticated;

alter table public.family_profiles enable row level security;

revoke all on table public.family_profiles from public, anon, authenticated, service_role;
grant select, insert, update on table public.family_profiles to authenticated;
revoke truncate on table public.family_profiles from authenticated;
revoke delete, truncate, references, trigger on table public.family_profiles from authenticated, anon, public;

create policy family_profiles_select
  on public.family_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = family_profiles.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy family_profiles_insert
  on public.family_profiles
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.households
      where households.id = family_profiles.household_id
        and households.owner_id = auth.uid()
    )
  );

create policy family_profiles_update
  on public.family_profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.households
      where households.id = family_profiles.household_id
        and households.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.households
      where households.id = family_profiles.household_id
        and households.owner_id = auth.uid()
    )
  );
