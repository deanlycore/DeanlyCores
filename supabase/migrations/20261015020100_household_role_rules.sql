-- Household permissions, scoped to one household.
--
-- owner: full control of that household. Several owners are allowed.
-- adult: add and edit Shared Money, Life, and Notes rows, and kid profiles.
-- view_only: read Shared rows only. No writes.
-- member: older name for adult. Kept so existing rows still pass checks.
-- A kid is a family profile with no login (user_id is null), not an enum value.
--
-- Any household_members row with role owner may edit. households.owner_id is
-- not the editor check. Nobody changes their own role. The last owner cannot
-- be demoted or removed. Just me (private) rows stay with their creator.
-- Removing a login removes that membership, their private rows, and their
-- Family card. Shared rows stay. The auth user stays.
--
-- household_member_role, can_write_household_content, and
-- purge_private_household_rows only read or delete the caller's own household.
-- They do not grant a bypass for other homes.

alter table public.household_members
  alter column role set default 'adult';

create or replace function public.household_member_role(p_household_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path to 'public'
as $$
  select hm.role
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = auth.uid();
$$;

comment on function public.household_member_role(uuid) is
  'Role of the signed-in user in one household. Null when they are not a member.';

create or replace function public.can_write_household_content(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.household_member_role(p_household_id) in ('owner', 'adult', 'member');
$$;

comment on function public.can_write_household_content(uuid) is
  'True for owner and adult. View only is false. Reads only the caller membership.';

-- Shared: any member, including view only.
-- Private: the creator, and never a view-only login. Owners do not see another person's Just me.
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
  select public.household_member_role(p_household_id) is not null
    and (
      p_visibility = 'shared'
      or (
        p_visibility = 'private'
        and p_owner_id = auth.uid()
        and public.household_member_role(p_household_id) is distinct from 'view_only'
      )
    );
$$;

-- Role changes. auth.uid() is null while this migration rewrites old rows.
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
    if old.role = 'owner'
       and new.role is distinct from 'owner'
       and not exists (
         select 1
         from public.household_members
         where household_members.household_id = old.household_id
           and household_members.role = 'owner'
           and household_members.user_id <> old.user_id
       ) then
      raise exception 'A household needs at least one owner.';
    end if;

    if auth.uid() is null then
      return new;
    end if;

    if auth.uid() = old.user_id then
      raise exception 'You cannot change your own role.';
    end if;

    if not public.is_household_owner(old.household_id) then
      raise exception 'Only an owner can change permissions.';
    end if;
  end if;

  return new;
end;
$$;

update public.household_members
set role = 'adult'
where role = 'member';

create or replace function public.purge_private_household_rows(
  p_household_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.';
  end if;

  if auth.uid() is distinct from p_user_id
     and not public.is_household_owner(p_household_id) then
    raise exception 'You cannot remove those rows.';
  end if;

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
    'subscriptions',
    'activity_events',
    'money_cards',
    'money_people'
  ]
  loop
    execute format(
      'delete from public.%I where household_id = $1 and owner_id = $2 and visibility = ''private''',
      t
    ) using p_household_id, p_user_id;
  end loop;

  delete from public.family_profiles
  where household_id = p_household_id
    and user_id = p_user_id;

  update public.user_preferences
  set household_id = null,
      updated_at = now()
  where user_id = p_user_id
    and household_id = p_household_id;
end;
$$;

comment on function public.purge_private_household_rows(uuid, uuid) is
  'Deletes one login''s private rows in one household. Shared rows stay. Vault files stay in storage; Supabase blocks direct deletes there.';

create or replace function public.protect_household_member_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.role = 'owner' and not exists (
    select 1
    from public.household_members
    where household_members.household_id = old.household_id
      and household_members.role = 'owner'
      and household_members.user_id <> old.user_id
  ) then
    raise exception 'A household needs at least one owner.';
  end if;

  perform public.purge_private_household_rows(old.household_id, old.user_id);
  return old;
end;
$$;

drop trigger if exists household_members_purge_private on public.household_members;
create trigger household_members_purge_private
  before delete on public.household_members
  for each row execute function public.protect_household_member_delete();

drop policy if exists household_members_update_role on public.household_members;
create policy household_members_update_role
  on public.household_members
  for update
  to authenticated
  using (
    public.is_household_owner(household_id)
    or user_id = auth.uid()
  )
  with check (
    public.is_household_owner(household_id)
    or user_id = auth.uid()
  );

drop policy if exists household_members_delete_self_or_owner on public.household_members;
create policy household_members_delete_self_or_owner
  on public.household_members
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_household_owner(household_id)
  );

-- Money, Life, and Notes writes. View only can still select Shared rows.
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
    'subscriptions',
    'money_cards',
    'money_people'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_write_household_content(household_id) and owner_id = auth.uid())',
      t || '_insert',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_row(household_id, visibility, owner_id) and public.can_write_household_content(household_id)) with check (public.can_write_household_content(household_id) and (visibility = ''shared'' or owner_id = auth.uid()))',
      t || '_update',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_row(household_id, visibility, owner_id) and public.can_write_household_content(household_id))',
      t || '_delete',
      t
    );
  end loop;
end $$;

drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert
  on public.activity_events
  for insert to authenticated
  with check (
    public.can_write_household_content(household_id)
    and owner_id = auth.uid()
    and actor_id = auth.uid()
  );

drop policy if exists activity_events_delete on public.activity_events;
create policy activity_events_delete
  on public.activity_events
  for delete to authenticated
  using (
    actor_id = auth.uid()
    and public.can_write_household_content(household_id)
  );

drop policy if exists money_payments_insert on public.money_payments;
create policy money_payments_insert
  on public.money_payments
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.can_write_household_content(household_id)
    and (
      (
        bill_id is not null
        and exists (
          select 1 from public.bills parent
          where parent.id = bill_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        card_id is not null
        and exists (
          select 1 from public.money_cards parent
          where parent.id = card_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        person_id is not null
        and exists (
          select 1 from public.money_people parent
          where parent.id = person_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
    )
  );

drop policy if exists money_payments_delete on public.money_payments;
create policy money_payments_delete
  on public.money_payments
  for delete to authenticated
  using (
    public.can_write_household_content(household_id)
    and (
      (
        bill_id is not null
        and exists (
          select 1 from public.bills parent
          where parent.id = bill_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        card_id is not null
        and exists (
          select 1 from public.money_cards parent
          where parent.id = card_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        person_id is not null
        and exists (
          select 1 from public.money_people parent
          where parent.id = person_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
    )
  );

drop policy if exists categories_write_member on public.categories;
create policy categories_insert
  on public.categories
  for insert to authenticated
  with check (public.can_write_household_content(household_id));

create policy categories_update
  on public.categories
  for update to authenticated
  using (public.can_write_household_content(household_id))
  with check (public.can_write_household_content(household_id));

create policy categories_delete
  on public.categories
  for delete to authenticated
  using (public.can_write_household_content(household_id));

drop policy if exists vault_objects_select on storage.objects;
create policy vault_objects_select
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and public.household_member_role(((storage.foldername(name))[1])::uuid) is not null
    and (
      (storage.foldername(name))[2] = 'shared'
      or (
        ((storage.foldername(name))[3])::uuid = auth.uid()
        and public.household_member_role(((storage.foldername(name))[1])::uuid) is distinct from 'view_only'
      )
    )
  );

drop policy if exists vault_objects_insert on storage.objects;
create policy vault_objects_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] in ('shared', 'private')
    and public.can_write_household_content(((storage.foldername(name))[1])::uuid)
    and ((storage.foldername(name))[3])::uuid = auth.uid()
  );

drop policy if exists vault_objects_delete on storage.objects;
create policy vault_objects_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
    and public.can_write_household_content(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = 'shared'
      or ((storage.foldername(name))[3])::uuid = auth.uid()
    )
  );

-- Kids: owner or adult. A person may edit their own name and color.
-- Any owner may edit every profile in the home. View only cannot.
create or replace function public.assign_family_profile_household()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  active uuid;
  caller_role public.member_role;
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

    if auth.uid() is null then
      return new;
    end if;

    caller_role := public.household_member_role(old.household_id);

    if caller_role = 'owner' then
      return new;
    end if;

    if old.user_id is not distinct from auth.uid() then
      if new.role is distinct from old.role
         or new.birthday is distinct from old.birthday
         or new.notes is distinct from old.notes
         or new.archived_at is distinct from old.archived_at
         or new.created_at is distinct from old.created_at
         or new.id is distinct from old.id then
        raise exception 'You can change your own name and color.';
      end if;
      return new;
    end if;

    if old.user_id is null and caller_role in ('adult', 'member') then
      if new.archived_at is distinct from old.archived_at then
        raise exception 'Only an owner can remove a family member.';
      end if;
      return new;
    end if;

    raise exception 'You cannot edit this family member.';
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

  caller_role := public.household_member_role(active);

  if active is null or caller_role not in ('owner', 'adult', 'member') then
    raise exception 'Only an owner or adult can add a family member.';
  end if;

  new.household_id := active;
  return new;
end;
$$;

drop policy if exists family_profiles_insert on public.family_profiles;
create policy family_profiles_insert
  on public.family_profiles
  for insert
  to authenticated
  with check (
    family_profiles.user_id is null
    and public.can_write_household_content(family_profiles.household_id)
  );

drop policy if exists family_profiles_update on public.family_profiles;
create policy family_profiles_update
  on public.family_profiles
  for update
  to authenticated
  using (
    public.is_household_owner(family_profiles.household_id)
    or (
      family_profiles.user_id = auth.uid()
      and public.is_household_member(family_profiles.household_id)
    )
    or (
      family_profiles.user_id is null
      and public.can_write_household_content(family_profiles.household_id)
    )
  )
  with check (
    public.is_household_owner(family_profiles.household_id)
    or (
      family_profiles.user_id = auth.uid()
      and public.is_household_member(family_profiles.household_id)
    )
    or (
      family_profiles.user_id is null
      and public.can_write_household_content(family_profiles.household_id)
    )
  );

drop policy if exists profiles_update_household_owner on public.profiles;
create policy profiles_update_household_owner
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.household_members as theirs
      where theirs.user_id = profiles.id
        and public.is_household_owner(theirs.household_id)
    )
  )
  with check (
    exists (
      select 1
      from public.household_members as theirs
      where theirs.user_id = profiles.id
        and public.is_household_owner(theirs.household_id)
    )
  );

revoke all on function public.household_member_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_write_household_content(uuid) from public, anon, authenticated, service_role;
revoke all on function public.purge_private_household_rows(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.protect_household_member_delete() from public, anon, authenticated, service_role;

grant execute on function public.household_member_role(uuid) to authenticated;
grant execute on function public.can_write_household_content(uuid) to authenticated;
grant execute on function public.purge_private_household_rows(uuid, uuid) to authenticated;
grant execute on function public.protect_household_member_delete() to authenticated;

grant delete on table public.household_members to authenticated;
revoke all on table public.household_members from anon;
revoke all on table public.family_profiles from anon;
revoke all on table public.profiles from anon;
