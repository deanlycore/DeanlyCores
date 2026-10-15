-- Private-row cleanup runs only when a membership row is deleted.
-- It is not an RPC. Owners cannot call it to wipe a current member's Just me rows.

create or replace function public.protect_household_member_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  other_owners integer;
  t text;
begin
  perform hm.user_id
  from public.household_members hm
  where hm.household_id = old.household_id
    and hm.role = 'owner'
  order by hm.user_id
  for update;

  if old.role = 'owner' then
    select count(*) into other_owners
    from public.household_members
    where household_id = old.household_id
      and role = 'owner'
      and user_id <> old.user_id;

    if other_owners = 0 then
      raise exception 'A household needs at least one owner.';
    end if;
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
    ) using old.household_id, old.user_id;
  end loop;

  delete from public.family_profiles
  where household_id = old.household_id
    and user_id = old.user_id;

  update public.user_preferences
  set household_id = null,
      updated_at = now()
  where user_id = old.user_id
    and household_id = old.household_id;

  return old;
end;
$$;

comment on function public.protect_household_member_delete() is
  'Trigger only. Removes one login''s private rows when their membership is deleted. Shared rows stay. Vault files stay in storage.';

revoke all on function public.protect_household_member_delete() from public, anon, authenticated, service_role;

revoke all on function public.purge_private_household_rows(uuid, uuid) from public, anon, authenticated, service_role;
drop function public.purge_private_household_rows(uuid, uuid);
