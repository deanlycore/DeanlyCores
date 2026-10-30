-- Leaving a household removes that login's Just me rows.
-- A line on someone else's shared recipe stays. The parent recipe decides.
-- Shared rows stay. The auth user stays. This trigger is still the only purge path.

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

  delete from public.meal_shopping_needs as msn
  where msn.household_id = old.household_id
    and (
      exists (
        select 1
        from public.meals as meal
        where meal.id = msn.meal_id
          and meal.household_id = old.household_id
          and meal.visibility = 'private'
          and meal.owner_id = old.user_id
      )
      or exists (
        select 1
        from public.shopping_items as item
        where item.id = msn.shopping_item_id
          and item.household_id = old.household_id
          and item.visibility = 'private'
          and item.owner_id = old.user_id
      )
      or (
        msn.source_kind = 'recipe_add'
        and msn.visibility = 'private'
        and msn.created_by = old.user_id
      )
    );

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

  delete from public.recipe_ingredients as ri
  using public.recipes as recipe
  where ri.recipe_id = recipe.id
    and recipe.household_id = old.household_id
    and recipe.visibility = 'private'
    and recipe.created_by = old.user_id;

  delete from public.recipes
  where household_id = old.household_id
    and created_by = old.user_id
    and visibility = 'private';

  foreach t in array array['shopping_lists', 'pantry_items']
  loop
    execute format(
      'delete from public.%I where household_id = $1 and created_by = $2 and visibility = ''private''',
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
  'Trigger only. Removes one login''s private rows when their membership is deleted. Lines on a shared recipe stay with that recipe. Shared rows stay. Vault files stay in storage.';

revoke all on function public.protect_household_member_delete() from public, anon, authenticated, service_role;
