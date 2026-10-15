-- A household with no name is "My household", for every tenant.
-- Redeeming a create-home code already used that fallback. The bootstrap
-- function now uses the same words. Existing rows keep their current name.
--
-- create_household is the existing bootstrap function. Replacing it keeps
-- security definer, because that is how the first home is inserted. This
-- does not add a new function.

alter table public.households
  alter column name set default 'My household';

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  chosen text;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  if exists (select 1 from public.households) then
    raise exception 'A create-home code is required.';
  end if;

  if exists (
    select 1 from public.household_members where user_id = uid
  ) then
    raise exception 'You already belong to a household.';
  end if;

  chosen := nullif(btrim(coalesce(household_name, '')), '');
  if chosen is null then
    chosen := 'My household';
  end if;
  if char_length(chosen) > 80 then
    raise exception 'Please use a shorter household name.';
  end if;

  insert into public.households (name)
  values (chosen)
  returning id into new_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_id, uid, 'owner');

  perform public.seed_default_categories(new_id);

  insert into public.user_preferences (user_id, household_id)
  values (uid, new_id)
  on conflict (user_id) do update
    set household_id = excluded.household_id,
        updated_at = now();

  return new_id;
end;
$$;
