-- Planner and shopping sync. The shared write block is one template, installed into both entry points.
-- Sync updates only auto_qty, auto_unit, and system_note.

create or replace function public.recompute_shopping_item_auto(p_household_id uuid, p_item_id uuid)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_groups integer;
  v_base numeric;
  v_group text;
  v_qty numeric(8, 2);
  v_unit text;
  v_to_base numeric;
  v_changed integer := 0;
begin
  if auth.uid() is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;

  select count(distinct link.unit_group), sum(link.qty_base), min(link.unit_group)
    into v_groups, v_base, v_group
  from public.meal_shopping_needs as link
  where link.shopping_item_id = p_item_id
    and link.household_id = p_household_id
    and link.qty_base is not null;

  if coalesce(v_groups, 0) = 1 and v_base is not null and v_base > 0 then
    select alias.canonical, alias.to_base
      into v_unit, v_to_base
    from public.unit_aliases as alias
    where alias.unit_group = v_group
      and alias.alias = alias.canonical
      and (
        (v_group = 'mass' and ((v_base >= 1000 and alias.canonical = 'kg') or (v_base < 1000 and alias.canonical = 'g')))
        or (v_group = 'volume' and ((v_base >= 1000 and alias.canonical = 'l') or (v_base < 1000 and alias.canonical = 'ml')))
        or (v_group = 'count' and alias.canonical = 'each')
        or (v_group = 'package' and alias.canonical = 'pack')
      )
    limit 1;
    if v_unit is not null and v_to_base > 0 then
      v_qty := round(v_base / v_to_base, 2);
    end if;
  end if;

  if v_qty is null or v_qty <= 0 or v_qty > 9999 then
    v_qty := null;
    v_unit := null;
  end if;

  update public.shopping_items
     set auto_qty = v_qty,
         auto_unit = v_unit,
         system_note = null
   where id = p_item_id
     and household_id = p_household_id
     and (
       auto_qty is distinct from v_qty
       or auto_unit is distinct from v_unit
       or system_note is distinct from null
     );
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function public.keep_or_delete_shopping_item(p_household_id uuid, p_item_id uuid)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_source text;
  v_manual_amount text;
  v_manual_unit_raw text;
  v_manual_qty numeric;
  v_manual_unit text;
  v_checked timestamptz;
  v_edited boolean;
begin
  if auth.uid() is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;

  if exists (
    select 1
    from public.meal_shopping_needs as link
    where link.shopping_item_id = p_item_id
      and link.household_id = p_household_id
  ) then
    return 0;
  end if;

  select item.source, item.manual_amount_raw, item.manual_unit_raw, item.manual_qty, item.manual_unit, item.checked_at, item.user_edited
    into v_source, v_manual_amount, v_manual_unit_raw, v_manual_qty, v_manual_unit, v_checked, v_edited
  from public.shopping_items as item
  where item.id = p_item_id
    and item.household_id = p_household_id
  for update;

  if not found then
    return 0;
  end if;

  if v_source = 'manual'
     or v_manual_amount is not null
     or v_manual_unit_raw is not null
     or v_manual_qty is not null
     or v_manual_unit is not null then
    update public.shopping_items
       set auto_qty = null,
           auto_unit = null,
           system_note = null
     where id = p_item_id
       and household_id = p_household_id
       and (
         auto_qty is distinct from null
         or auto_unit is distinct from null
         or system_note is distinct from null
       );
    return 0;
  end if;

  if v_checked is not null or v_edited then
    update public.shopping_items
       set auto_qty = null,
           auto_unit = null,
           system_note = 'No longer needed for a meal. Left on the list.'
     where id = p_item_id
       and household_id = p_household_id
       and (
         auto_qty is distinct from null
         or auto_unit is distinct from null
         or system_note is distinct from 'No longer needed for a meal. Left on the list.'
       );
    return 0;
  end if;

  delete from public.shopping_items
  where id = p_item_id
    and household_id = p_household_id;
  return 1;
end;
$$;

revoke all on function public.recompute_shopping_item_auto(uuid, uuid) from public, anon;
revoke all on function public.keep_or_delete_shopping_item(uuid, uuid) from public, anon;
grant execute on function public.recompute_shopping_item_auto(uuid, uuid) to authenticated;
grant execute on function public.keep_or_delete_shopping_item(uuid, uuid) to authenticated;

-- One write block, installed into sync_meal_shopping and add_recipe_to_shopping.
do $install$
declare
  tpl text := $fn$
create or replace function public.__NAME__(__ARGS__)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $body$
declare
  v_user uuid := auth.uid();
  v_list uuid;
  v_visibility public.visibility;
  v_recipe_id uuid;
  v_catalog_id uuid;
  v_source text;
  v_meal_id uuid;
  v_batch uuid;
  v_added integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_line jsonb;
  v_ri uuid;
  v_ci uuid;
  v_match text;
  v_group text;
  v_qty numeric;
  v_raw text;
  v_name text;
  v_category text;
  v_item uuid;
  v_hint uuid;
  v_touched uuid[] := '{}'::uuid[];
  v_lost uuid[] := '{}'::uuid[];
  v_id uuid;
  v_changed integer;
  v_inserted uuid;
  v_previous uuid[] := '{}'::uuid[];
begin
  if v_user is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;
  perform set_config('deanly.sync_txn', 'on', true);
  __PREAMBLE__
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 80 then
    raise exception 'That item is not available.';
  end if;

  for v_line in select line.value from jsonb_array_elements(p_lines) as line(value)
  loop
    v_ri := nullif(v_line->>'recipe_ingredient_id', '')::uuid;
    v_ci := nullif(v_line->>'catalog_ingredient_id', '')::uuid;
    if num_nonnulls(v_ri, v_ci) <> 1 then
      raise exception 'That item is not available.';
    end if;
    if v_ri is not null then
      if v_recipe_id is null or not exists (
        select 1 from public.recipe_ingredients as ri
        where ri.id = v_ri and ri.recipe_id = v_recipe_id and ri.household_id = p_household_id
      ) then
        raise exception 'That item is not available.';
      end if;
    elsif v_catalog_id is null or not exists (
      select 1 from public.catalog_recipe_ingredients as ci
      where ci.id = v_ci and ci.catalog_recipe_id = v_catalog_id
    ) then
      raise exception 'That item is not available.';
    end if;
    v_match := btrim(coalesce(v_line->>'match_key', ''));
    v_group := nullif(v_line->>'unit_group', '');
    v_raw := nullif(btrim(coalesce(v_line->>'amount_raw', '')), '');
    v_name := btrim(coalesce(v_line->>'name', ''));
    if char_length(v_match) < 1 or char_length(v_match) > 200
       or char_length(v_name) < 1 or char_length(v_name) > 140
       or (v_raw is not null and char_length(v_raw) > 40)
       or (v_group is not null and v_group not in ('mass', 'volume', 'count', 'package')) then
      raise exception 'That item is not available.';
    end if;
    if nullif(v_line->>'qty_base', '') is not null and (v_line->>'qty_base')::numeric <= 0 then
      raise exception 'That item is not available.';
    end if;
  end loop;

  select coalesce(array_agg(distinct msn.shopping_item_id), '{}'::uuid[])
    into v_previous
  from public.meal_shopping_needs as msn
  where msn.household_id = p_household_id
    and (
      (v_source = 'meal' and msn.meal_id = v_meal_id)
      or (v_source = 'recipe_add' and msn.add_batch_id = v_batch)
    );

  for v_line in select line.value from jsonb_array_elements(p_lines) as line(value)
  loop
    v_ri := nullif(v_line->>'recipe_ingredient_id', '')::uuid;
    v_ci := nullif(v_line->>'catalog_ingredient_id', '')::uuid;
    v_match := btrim(v_line->>'match_key');
    v_group := nullif(v_line->>'unit_group', '');
    v_qty := nullif(v_line->>'qty_base', '')::numeric;
    v_raw := nullif(btrim(coalesce(v_line->>'amount_raw', '')), '');
    v_name := btrim(v_line->>'name');
    v_category := nullif(v_line->>'category', '');
    if v_category is null or v_category not in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'other') then
      v_category := 'other';
    end if;
    v_hint := nullif(v_line->>'shopping_item_id', '')::uuid;
    v_item := null;

    select item.id into v_item
    from public.shopping_items as item
    where item.list_id = v_list
      and item.household_id = p_household_id
      and item.match_key = v_match
      and item.source = 'auto'
      and item.checked_at is null
    limit 1;

    if v_item is null and v_hint is not null then
      select item.id into v_item
      from public.shopping_items as item
      where item.id = v_hint
        and item.list_id = v_list
        and item.household_id = p_household_id
        and item.checked_at is null;
    end if;

    if v_item is null then
      v_inserted := null;
      insert into public.shopping_items (
        household_id, owner_id, visibility, list_id, name, category,
        source, user_edited, match_key,
        manual_amount_raw, manual_unit_raw, manual_qty, manual_unit
      ) values (
        p_household_id, v_user, v_visibility, v_list, v_name, v_category,
        'auto', false, v_match,
        null, null, null, null
      )
      on conflict (list_id, match_key) where match_key is not null and checked_at is null
      do nothing
      returning id into v_inserted;
      if v_inserted is not null then
        v_item := v_inserted;
        v_added := v_added + 1;
      else
        select item.id into v_item
        from public.shopping_items as item
        where item.list_id = v_list
          and item.household_id = p_household_id
          and item.match_key = v_match
          and item.checked_at is null
        limit 1;
      end if;
    end if;

    if v_item is null then
      raise exception 'That item is not available.';
    end if;
    v_touched := array_append(v_touched, v_item);

    if v_source = 'meal' and v_ri is not null then
      insert into public.meal_shopping_needs (
        household_id, created_by, visibility, source_kind, meal_id, add_batch_id,
        shopping_item_id, recipe_ingredient_id, catalog_ingredient_id, match_key, amount_raw, qty_base, unit_group
      ) values (
        p_household_id, v_user, v_visibility, 'meal', v_meal_id, null,
        v_item, v_ri, null, v_match, v_raw, v_qty, v_group
      )
      on conflict (meal_id, recipe_ingredient_id) where meal_id is not null and recipe_ingredient_id is not null
      do update set
        shopping_item_id = excluded.shopping_item_id,
        match_key = excluded.match_key,
        amount_raw = excluded.amount_raw,
        qty_base = excluded.qty_base,
        unit_group = excluded.unit_group
      where public.meal_shopping_needs.shopping_item_id is distinct from excluded.shopping_item_id
         or public.meal_shopping_needs.match_key is distinct from excluded.match_key
         or public.meal_shopping_needs.amount_raw is distinct from excluded.amount_raw
         or public.meal_shopping_needs.qty_base is distinct from excluded.qty_base
         or public.meal_shopping_needs.unit_group is distinct from excluded.unit_group;
    elsif v_source = 'meal' then
      insert into public.meal_shopping_needs (
        household_id, created_by, visibility, source_kind, meal_id, add_batch_id,
        shopping_item_id, recipe_ingredient_id, catalog_ingredient_id, match_key, amount_raw, qty_base, unit_group
      ) values (
        p_household_id, v_user, v_visibility, 'meal', v_meal_id, null,
        v_item, null, v_ci, v_match, v_raw, v_qty, v_group
      )
      on conflict (meal_id, catalog_ingredient_id) where meal_id is not null and catalog_ingredient_id is not null
      do update set
        shopping_item_id = excluded.shopping_item_id,
        match_key = excluded.match_key,
        amount_raw = excluded.amount_raw,
        qty_base = excluded.qty_base,
        unit_group = excluded.unit_group
      where public.meal_shopping_needs.shopping_item_id is distinct from excluded.shopping_item_id
         or public.meal_shopping_needs.match_key is distinct from excluded.match_key
         or public.meal_shopping_needs.amount_raw is distinct from excluded.amount_raw
         or public.meal_shopping_needs.qty_base is distinct from excluded.qty_base
         or public.meal_shopping_needs.unit_group is distinct from excluded.unit_group;
    elsif v_ri is not null then
      insert into public.meal_shopping_needs (
        household_id, created_by, visibility, source_kind, meal_id, add_batch_id,
        shopping_item_id, recipe_ingredient_id, catalog_ingredient_id, match_key, amount_raw, qty_base, unit_group
      ) values (
        p_household_id, v_user, v_visibility, 'recipe_add', null, v_batch,
        v_item, v_ri, null, v_match, v_raw, v_qty, v_group
      )
      on conflict (household_id, add_batch_id, recipe_ingredient_id) where add_batch_id is not null and recipe_ingredient_id is not null
      do update set
        shopping_item_id = excluded.shopping_item_id,
        match_key = excluded.match_key,
        amount_raw = excluded.amount_raw,
        qty_base = excluded.qty_base,
        unit_group = excluded.unit_group
      where public.meal_shopping_needs.shopping_item_id is distinct from excluded.shopping_item_id
         or public.meal_shopping_needs.match_key is distinct from excluded.match_key
         or public.meal_shopping_needs.amount_raw is distinct from excluded.amount_raw
         or public.meal_shopping_needs.qty_base is distinct from excluded.qty_base
         or public.meal_shopping_needs.unit_group is distinct from excluded.unit_group;
    else
      insert into public.meal_shopping_needs (
        household_id, created_by, visibility, source_kind, meal_id, add_batch_id,
        shopping_item_id, recipe_ingredient_id, catalog_ingredient_id, match_key, amount_raw, qty_base, unit_group
      ) values (
        p_household_id, v_user, v_visibility, 'recipe_add', null, v_batch,
        v_item, null, v_ci, v_match, v_raw, v_qty, v_group
      )
      on conflict (household_id, add_batch_id, catalog_ingredient_id) where add_batch_id is not null and catalog_ingredient_id is not null
      do update set
        shopping_item_id = excluded.shopping_item_id,
        match_key = excluded.match_key,
        amount_raw = excluded.amount_raw,
        qty_base = excluded.qty_base,
        unit_group = excluded.unit_group
      where public.meal_shopping_needs.shopping_item_id is distinct from excluded.shopping_item_id
         or public.meal_shopping_needs.match_key is distinct from excluded.match_key
         or public.meal_shopping_needs.amount_raw is distinct from excluded.amount_raw
         or public.meal_shopping_needs.qty_base is distinct from excluded.qty_base
         or public.meal_shopping_needs.unit_group is distinct from excluded.unit_group;
    end if;
  end loop;

  with gone as (
    delete from public.meal_shopping_needs as msn
    where msn.household_id = p_household_id
      and (
        (v_source = 'meal' and msn.meal_id = v_meal_id)
        or (v_source = 'recipe_add' and msn.add_batch_id = v_batch)
      )
      and not exists (
        select 1
        from jsonb_array_elements(p_lines) as line(value)
        where (
          msn.recipe_ingredient_id is not null
          and msn.recipe_ingredient_id = nullif(line.value->>'recipe_ingredient_id', '')::uuid
        ) or (
          msn.catalog_ingredient_id is not null
          and msn.catalog_ingredient_id = nullif(line.value->>'catalog_ingredient_id', '')::uuid
        )
      )
    returning msn.shopping_item_id
  )
  select coalesce(array_agg(distinct gone.shopping_item_id), '{}'::uuid[]) into v_lost from gone;

  if v_previous is not null then
    foreach v_id in array v_previous
    loop
      if v_touched is null or not v_id = any (v_touched) then
        v_lost := array_append(v_lost, v_id);
      end if;
    end loop;
  end if;

  select coalesce(array_agg(distinct item_id), '{}'::uuid[]) into v_touched
  from unnest(v_touched) as item_id;

  foreach v_id in array v_touched
  loop
    if exists (
      select 1 from public.meal_shopping_needs as link
      where link.shopping_item_id = v_id and link.household_id = p_household_id
    ) then
      v_changed := public.recompute_shopping_item_auto(p_household_id, v_id);
      v_updated := v_updated + coalesce(v_changed, 0);
    end if;
  end loop;

  foreach v_id in array v_lost
  loop
    if exists (
      select 1 from public.meal_shopping_needs as link
      where link.shopping_item_id = v_id and link.household_id = p_household_id
    ) then
      v_changed := public.recompute_shopping_item_auto(p_household_id, v_id);
      v_updated := v_updated + coalesce(v_changed, 0);
    else
      v_removed := v_removed + public.keep_or_delete_shopping_item(p_household_id, v_id);
    end if;
  end loop;

  perform set_config('deanly.sync_txn', 'off', true);
  return jsonb_build_object(
    'ok', true,
    'list_id', v_list,
    'added', v_added,
    'updated', v_updated,
    'removed', v_removed
  );
end;
$body$;
$fn$;
  meal_preamble text := $pre$
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 80 then
    raise exception 'That item is not available.';
  end if;
  select meal.visibility, meal.recipe_id, meal.catalog_recipe_id
    into v_visibility, v_recipe_id, v_catalog_id
  from public.meals as meal
  where meal.id = p_meal_id
    and meal.household_id = p_household_id;
  if not found then
    raise exception 'That item is not available.';
  end if;
  select list.id into v_list
  from public.shopping_lists as list
  where list.household_id = p_household_id
    and list.visibility = v_visibility
    and list.is_default
    and (v_visibility = 'shared' or list.created_by = v_user)
  limit 1;
  if v_list is null then
    insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
    values (p_household_id, v_user, v_visibility, 'Groceries', true)
    returning id into v_list;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_list::text, 0));
  select meal.visibility, meal.recipe_id, meal.catalog_recipe_id
    into v_visibility, v_recipe_id, v_catalog_id
  from public.meals as meal
  where meal.id = p_meal_id
    and meal.household_id = p_household_id
  for update;
  if not found then
    raise exception 'That item is not available.';
  end if;
  if v_recipe_id is null and v_catalog_id is null and jsonb_array_length(p_lines) > 0 then
    raise exception 'That item is not available.';
  end if;
  v_source := 'meal';
  v_meal_id := p_meal_id;
  v_batch := null;
$pre$;
  add_preamble text := $pre$
  if p_add_batch_id is null
     or p_lines is null
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) > 80
     or num_nonnulls(p_recipe_id, p_catalog_recipe_id) <> 1
     or p_servings is null
     or p_servings < 1
     or p_servings > 50 then
    raise exception 'That recipe is not available.';
  end if;
  if p_recipe_id is not null then
    select recipe.visibility, recipe.created_by
      into v_visibility, v_recipe_id
    from public.recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.household_id = p_household_id;
    if not found or not public.can_access_row(p_household_id, v_visibility, v_recipe_id) then
      raise exception 'That recipe is not available.';
    end if;
    v_recipe_id := p_recipe_id;
    v_catalog_id := null;
  else
    if not exists (select 1 from public.catalog_recipes as recipe where recipe.id = p_catalog_recipe_id) then
      raise exception 'That recipe is not available.';
    end if;
    v_visibility := 'shared';
    v_recipe_id := null;
    v_catalog_id := p_catalog_recipe_id;
  end if;
  select list.id into v_list
  from public.shopping_lists as list
  where list.household_id = p_household_id
    and list.visibility = v_visibility
    and list.is_default
    and (v_visibility = 'shared' or list.created_by = v_user)
  limit 1;
  if v_list is null then
    insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
    values (p_household_id, v_user, v_visibility, 'Groceries', true)
    returning id into v_list;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_list::text, 0));
  if p_recipe_id is not null then
    perform 1
    from public.recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.household_id = p_household_id
      and recipe.visibility = v_visibility
    for share;
    if not found then
      raise exception 'That recipe is not available.';
    end if;
  end if;
  v_source := 'recipe_add';
  v_meal_id := null;
  v_batch := p_add_batch_id;
$pre$;
begin
  execute replace(
    replace(
      replace(tpl, '__NAME__', 'sync_meal_shopping'),
      '__ARGS__', 'p_household_id uuid, p_meal_id uuid, p_lines jsonb'
    ),
    '__PREAMBLE__',
    meal_preamble
  );
  execute replace(
    replace(
      replace(tpl, '__NAME__', 'add_recipe_to_shopping'),
      '__ARGS__', 'p_household_id uuid, p_add_batch_id uuid, p_recipe_id uuid, p_catalog_recipe_id uuid, p_servings integer, p_lines jsonb'
    ),
    '__PREAMBLE__',
    add_preamble
  );
end
$install$;

revoke all on function public.sync_meal_shopping(uuid, uuid, jsonb) from public, anon;
revoke all on function public.add_recipe_to_shopping(uuid, uuid, uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.sync_meal_shopping(uuid, uuid, jsonb) to authenticated;
grant execute on function public.add_recipe_to_shopping(uuid, uuid, uuid, uuid, integer, jsonb) to authenticated;

create or replace function public.save_planned_meal(
  p_household_id uuid,
  p_meal jsonb,
  p_lines jsonb,
  p_apply_to_list boolean
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_new uuid;
  v_req uuid;
  v_title text;
  v_slot text;
  v_day date;
  v_notes text;
  v_servings integer;
  v_visibility public.visibility;
  v_recipe uuid;
  v_catalog uuid;
  v_stamp timestamptz;
  v_old public.visibility;
  v_count integer;
  v_line jsonb;
  v_ri uuid;
  v_ci uuid;
  v_lost uuid[];
  v_item uuid;
  v_sync jsonb;
  v_list uuid;
begin
  if v_user is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 80 then
    raise exception 'That item is not available.';
  end if;

  v_id := nullif(p_meal->>'id', '')::uuid;
  v_req := nullif(p_meal->>'client_request_id', '')::uuid;
  v_title := btrim(coalesce(p_meal->>'title', ''));
  v_slot := p_meal->>'slot';
  v_day := (p_meal->>'meal_on')::date;
  v_notes := nullif(p_meal->>'notes', '');
  v_servings := coalesce((p_meal->>'servings')::integer, 1);
  v_visibility := case
    when p_meal->>'visibility' = 'private' then 'private'::public.visibility
    else 'shared'::public.visibility
  end;
  v_recipe := nullif(p_meal->>'recipe_id', '')::uuid;
  v_catalog := nullif(p_meal->>'catalog_recipe_id', '')::uuid;

  if v_slot not in ('breakfast', 'lunch', 'dinner', 'snack')
     or v_servings < 1
     or v_servings > 50
     or char_length(v_title) < 1
     or char_length(v_title) > 140
     or num_nonnulls(v_recipe, v_catalog) > 1
     or v_day is null then
    raise exception 'That item is not available.';
  end if;

  for v_line in select line.value from jsonb_array_elements(p_lines) as line(value)
  loop
    v_ri := nullif(v_line->>'recipe_ingredient_id', '')::uuid;
    v_ci := nullif(v_line->>'catalog_ingredient_id', '')::uuid;
    if v_ri is not null then
      if v_recipe is null or not exists (
        select 1 from public.recipe_ingredients as ri
        where ri.id = v_ri and ri.recipe_id = v_recipe and ri.household_id = p_household_id
      ) then
        raise exception 'That item is not available.';
      end if;
    elsif v_ci is not null then
      if v_catalog is null or not exists (
        select 1 from public.catalog_recipe_ingredients as ci
        where ci.id = v_ci and ci.catalog_recipe_id = v_catalog
      ) then
        raise exception 'That item is not available.';
      end if;
    end if;
  end loop;

  if v_id is null then
    insert into public.meals (
      household_id, owner_id, visibility, title, meal_on, slot, notes, servings, recipe_id, catalog_recipe_id, client_request_id
    ) values (
      p_household_id, v_user, v_visibility, v_title, v_day, v_slot, v_notes, v_servings, v_recipe, v_catalog, v_req
    )
    on conflict (household_id, client_request_id) where client_request_id is not null
    do nothing
    returning id into v_new;
    if v_new is null then
      select meal.id into v_new
      from public.meals as meal
      where meal.household_id = p_household_id
        and meal.client_request_id = v_req;
      return jsonb_build_object('ok', true, 'id', v_new, 'replayed', true);
    end if;
    v_id := v_new;
  else
    select list.id into v_list
    from public.shopping_lists as list
    where list.household_id = p_household_id
      and list.is_default
      and (
        list.visibility = 'shared'
        or (list.visibility = 'private' and list.created_by = v_user)
      )
    order by list.id
    limit 1;
    if v_list is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_list::text, 0));
    end if;
    select meal.visibility, meal.updated_at
      into v_old, v_stamp
    from public.meals as meal
    where meal.id = v_id
      and meal.household_id = p_household_id
    for update;
    if not found or nullif(p_meal->>'updated_at', '') is null or v_stamp is distinct from (p_meal->>'updated_at')::timestamptz then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
    if v_old is distinct from v_visibility then
      perform set_config('deanly.sync_txn', 'on', true);
      select coalesce(array_agg(distinct link.shopping_item_id), '{}'::uuid[])
        into v_lost
      from public.meal_shopping_needs as link
      where link.meal_id = v_id
        and link.household_id = p_household_id;
      delete from public.meal_shopping_needs as link
      where link.meal_id = v_id
        and link.household_id = p_household_id;
      if v_lost is not null then
        foreach v_item in array v_lost
        loop
          if exists (
            select 1 from public.meal_shopping_needs as link
            where link.shopping_item_id = v_item and link.household_id = p_household_id
          ) then
            perform public.recompute_shopping_item_auto(p_household_id, v_item);
          else
            perform public.keep_or_delete_shopping_item(p_household_id, v_item);
          end if;
        end loop;
      end if;
    end if;
    update public.meals
      set title = v_title,
          meal_on = v_day,
          slot = v_slot,
          notes = v_notes,
          servings = v_servings,
          visibility = v_visibility,
          recipe_id = v_recipe,
          catalog_recipe_id = v_catalog
    where id = v_id
      and household_id = p_household_id
      and updated_at = v_stamp;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      perform set_config('deanly.sync_txn', 'off', true);
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
    perform set_config('deanly.sync_txn', 'off', true);
  end if;

  if coalesce(p_apply_to_list, false) and (v_recipe is not null or v_catalog is not null) then
    v_sync := public.sync_meal_shopping(p_household_id, v_id, p_lines);
    return v_sync || jsonb_build_object('id', v_id, 'replayed', false);
  end if;

  perform set_config('deanly.sync_txn', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_id, 'replayed', false, 'added', 0, 'updated', 0, 'removed', 0);
end;
$$;

create or replace function public.remove_planned_meal(
  p_household_id uuid,
  p_meal_id uuid,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_stamp timestamptz;
  v_visibility public.visibility;
  v_list uuid;
  v_lost uuid[];
  v_item uuid;
begin
  if v_user is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;
  if p_meal_id is null then
    raise exception 'That item is not available.';
  end if;

  select meal.visibility into v_visibility
  from public.meals as meal
  where meal.id = p_meal_id
    and meal.household_id = p_household_id;
  if not found then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;

  select list.id into v_list
  from public.shopping_lists as list
  where list.household_id = p_household_id
    and list.visibility = v_visibility
    and list.is_default
    and (v_visibility = 'shared' or list.created_by = v_user)
  order by list.id
  limit 1;
  if v_list is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_list::text, 0));
  end if;

  select meal.updated_at into v_stamp
  from public.meals as meal
  where meal.id = p_meal_id
    and meal.household_id = p_household_id
  for update;
  if not found or v_stamp is distinct from p_updated_at then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;

  perform set_config('deanly.sync_txn', 'on', true);
  select coalesce(array_agg(distinct link.shopping_item_id), '{}'::uuid[])
    into v_lost
  from public.meal_shopping_needs as link
  where link.meal_id = p_meal_id
    and link.household_id = p_household_id;

  delete from public.meals
  where id = p_meal_id
    and household_id = p_household_id;

  if v_lost is not null then
    foreach v_item in array v_lost
    loop
      if exists (
        select 1 from public.meal_shopping_needs as link
        where link.shopping_item_id = v_item and link.household_id = p_household_id
      ) then
        perform public.recompute_shopping_item_auto(p_household_id, v_item);
      else
        perform public.keep_or_delete_shopping_item(p_household_id, v_item);
      end if;
    end loop;
  end if;

  perform set_config('deanly.sync_txn', 'off', true);
  return jsonb_build_object('ok', true, 'id', p_meal_id);
end;
$$;

revoke all on function public.save_planned_meal(uuid, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.remove_planned_meal(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.save_planned_meal(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.remove_planned_meal(uuid, uuid, timestamptz) to authenticated;
