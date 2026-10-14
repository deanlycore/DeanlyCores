-- Link each household login to a Family card.
--
-- family_profiles.user_id is null for people without an account (kids and other
-- profiles added by hand). It is set for a row in household_members.
-- Color already lives on family_profiles. The relationship text in
-- family_profiles.role stays a label such as "Son" or "Grandma".
-- The permission is household_members.role: owner or member.
-- Nothing else on the member is a household permission. user_preferences
-- (currency, appearance, notifications) stays private to that login.
--
-- Who may edit:
--   households.owner_id may change anyone's name, color, and role in that home.
--   When two owner memberships exist, only that earliest owner (owner_id) may.
--   A member may change their own name and color, not their role.
--   The last remaining owner membership cannot be demoted.
--
-- These functions are security invoker. They do not bypass row level security.
-- A new membership still gets its Family card because create_household and
-- redeem_household_invite_code are existing security-definer functions owned
-- by postgres, and this trigger runs inside them.

alter table public.family_profiles
  add column user_id uuid references auth.users (id) on delete cascade;

comment on column public.family_profiles.user_id is
  'Login this card mirrors. Null for a person without an account.';

comment on table public.family_profiles is
  'Household people. user_id is set when the person also has a login.';

create unique index family_profiles_household_user_uidx
  on public.family_profiles (household_id, user_id)
  where user_id is not null;

-- Kids still land in the caller's active household, and only the owner of that
-- home can add one. A linked card keeps the household on the membership row.
-- The update check does not read family_profiles (that recurses, 42P17).
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
    if new.user_id is distinct from old.user_id then
      raise exception 'Login link cannot be changed.';
    end if;
    if old.user_id is not null and new.archived_at is distinct from old.archived_at then
      raise exception 'A household login stays on Family.';
    end if;
    return new;
  end if;

  if new.user_id is not null then
    if new.household_id is null or not exists (
      select 1
      from public.household_members
      where household_members.household_id = new.household_id
        and household_members.user_id = new.user_id
    ) then
      raise exception 'A login member must already belong to this household.';
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

drop policy if exists family_profiles_update on public.family_profiles;

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
    or (
      family_profiles.user_id = auth.uid()
      and exists (
        select 1
        from public.household_members
        where household_members.household_id = family_profiles.household_id
          and household_members.user_id = auth.uid()
      )
    )
  )
  with check (
    exists (
      select 1
      from public.households
      where households.id = family_profiles.household_id
        and households.owner_id = auth.uid()
    )
    or (
      family_profiles.user_id = auth.uid()
      and exists (
        select 1
        from public.household_members
        where household_members.household_id = family_profiles.household_id
          and household_members.user_id = auth.uid()
      )
    )
  );

-- Keep the account display name and the Family card name the same.
-- Each trigger writes only when the text actually changed, so they do not loop.
create or replace function public.sync_family_profile_display_name()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    return new;
  end if;

  update public.profiles
  set display_name = new.name
  where profiles.id = new.user_id
    and profiles.display_name is distinct from new.name;

  return new;
end;
$$;

create trigger family_profiles_sync_display_name
  after insert or update of name on public.family_profiles
  for each row execute function public.sync_family_profile_display_name();

create or replace function public.sync_profile_name_to_family()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  label text;
begin
  label := nullif(btrim(coalesce(new.display_name, '')), '');
  if label is null or char_length(label) > 80 then
    return new;
  end if;

  update public.family_profiles
  set name = label
  where family_profiles.user_id = new.id
    and family_profiles.name is distinct from label;

  return new;
end;
$$;

create trigger profiles_sync_family_name
  after update of display_name on public.profiles
  for each row execute function public.sync_profile_name_to_family();

-- Owner may change another person's display name. They may not change the
-- avatar or the account id. A person can still edit their own profile.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile cannot be reassigned.';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from old.id then
    if new.avatar_url is distinct from old.avatar_url
       or new.created_at is distinct from old.created_at then
      raise exception 'Only a display name can be changed for another person.';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

create policy profiles_update_household_owner
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members as theirs
      join public.households as home on home.id = theirs.household_id
      where theirs.user_id = profiles.id
        and home.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members as theirs
      join public.households as home on home.id = theirs.household_id
      where theirs.user_id = profiles.id
        and home.owner_id = auth.uid()
    )
  );

insert into public.family_profiles (household_id, user_id, name, color)
select
  members.household_id,
  members.user_id,
  left(coalesce(nullif(btrim(profiles.display_name), ''), 'Member'), 80),
  'teal'
from public.household_members as members
left join public.profiles as profiles on profiles.id = members.user_id
where not exists (
  select 1
  from public.family_profiles as existing
  where existing.household_id = members.household_id
    and existing.user_id = members.user_id
);

create or replace function public.ensure_family_profile_for_member()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  label text;
begin
  select left(coalesce(nullif(btrim(profiles.display_name), ''), 'Member'), 80)
    into label
  from public.profiles
  where profiles.id = new.user_id;

  if label is null then
    label := 'Member';
  end if;

  insert into public.family_profiles (household_id, user_id, name, color)
  values (new.household_id, new.user_id, label, 'teal')
  on conflict (household_id, user_id) where user_id is not null do nothing;

  return new;
end;
$$;

create trigger household_members_ensure_family_profile
  after insert on public.household_members
  for each row execute function public.ensure_family_profile_for_member();

-- Role changes are the permission edit. Only households.owner_id can make them.
-- A member updating their own row fails this policy, so they cannot change a role.
create or replace function public.protect_household_member_role()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.household_id is distinct from old.household_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Membership cannot be reassigned.';
  end if;

  if new.role is distinct from old.role then
    if not exists (
      select 1
      from public.households
      where households.id = old.household_id
        and households.owner_id = auth.uid()
    ) then
      raise exception 'Only the household owner can change permissions.';
    end if;

    if old.role = 'owner' and new.role is distinct from 'owner' and not exists (
      select 1
      from public.household_members
      where household_members.household_id = old.household_id
        and household_members.role = 'owner'
        and household_members.user_id <> old.user_id
    ) then
      raise exception 'The last owner cannot be demoted.';
    end if;
  end if;

  return new;
end;
$$;

create trigger household_members_protect_role
  before update on public.household_members
  for each row execute function public.protect_household_member_role();

create policy household_members_update_role
  on public.household_members
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.households
      where households.id = household_members.household_id
        and households.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.households
      where households.id = household_members.household_id
        and households.owner_id = auth.uid()
    )
  );

revoke all on function public.sync_family_profile_display_name() from public, anon, authenticated, service_role;
revoke all on function public.sync_profile_name_to_family() from public, anon, authenticated, service_role;
revoke all on function public.protect_profile_fields() from public, anon, authenticated, service_role;
revoke all on function public.ensure_family_profile_for_member() from public, anon, authenticated, service_role;
revoke all on function public.protect_household_member_role() from public, anon, authenticated, service_role;

grant execute on function public.sync_family_profile_display_name() to authenticated;
grant execute on function public.sync_profile_name_to_family() to authenticated;
grant execute on function public.protect_profile_fields() to authenticated;
grant execute on function public.ensure_family_profile_for_member() to authenticated;
grant execute on function public.protect_household_member_role() to authenticated;

revoke all on table public.household_members from anon;
grant update (role) on table public.household_members to authenticated;

revoke all on table public.family_profiles from anon;
revoke all on table public.profiles from anon;
