-- Household comes from the caller, not from the first membership row.
-- Ingredient lines are updated in place so created_by stays with the person who added the line.
-- RLS policies call these helpers. Revoking PUBLIC left no authenticated grant in the migration history.

grant execute on function public.can_access_row(uuid, public.visibility, uuid) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

create unique index recipes_household_key
  on public.recipes (id, household_id);

alter table public.recipe_ingredients
  drop constraint recipe_ingredients_recipe_id_sort_order_key;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_sort_key
  unique (recipe_id, sort_order)
  deferrable initially deferred;

create or replace function public.protect_household_row()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  creator_key text := case when new_row ? 'owner_id' then 'owner_id' else 'created_by' end;
  parent_household uuid;
  parent_visibility public.visibility;
  parent_creator uuid;
  parent_found boolean;
begin
  if tg_op = 'UPDATE' then
    if new_row->>'household_id' is distinct from old_row->>'household_id' then
      raise exception 'Household cannot be reassigned.';
    end if;
    if new_row->>creator_key is distinct from old_row->>creator_key then
      raise exception 'Owner cannot be reassigned.';
    end if;
    if tg_table_name = 'recipes'
       and old_row->>'visibility' = 'shared'
       and new_row->>'visibility' = 'private'
       and exists (
         select 1
         from public.recipe_ingredients as ri
         where ri.recipe_id = new.id
           and ri.created_by::text is distinct from new_row->>'created_by'
       ) then
      raise exception 'others_added' using errcode = 'P0001';
    end if;
    if new_row->>'visibility' is distinct from old_row->>'visibility'
       and tg_table_name is distinct from 'recipe_ingredients'
       and old_row->>creator_key is distinct from auth.uid()::text then
      raise exception 'Only the person who added this can change who sees it.';
    end if;
  end if;

  if tg_table_name = 'shopping_items' then
    select list.household_id, list.visibility, list.created_by
      into parent_household, parent_visibility, parent_creator
    from public.shopping_lists as list
    where list.id = nullif(new_row->>'list_id', '')::uuid;
    parent_found := found;
    if not parent_found
       or parent_household::text is distinct from new_row->>'household_id'
       or parent_visibility::text is distinct from new_row->>'visibility'
       or not public.can_access_row(parent_household, parent_visibility, parent_creator)
       or (parent_visibility = 'private' and parent_creator::text is distinct from new_row->>'owner_id')
    then
      raise exception 'That list is not available.';
    end if;
  end if;

  if tg_table_name = 'pantry_items' and nullif(new_row->>'shopping_item_id', '') is not null then
    select item.household_id, item.visibility, item.owner_id
      into parent_household, parent_visibility, parent_creator
    from public.shopping_items as item
    where item.id = (new_row->>'shopping_item_id')::uuid;
    parent_found := found;
    if not parent_found
       or parent_household::text is distinct from new_row->>'household_id'
       or parent_visibility::text is distinct from new_row->>'visibility'
       or not public.can_access_row(parent_household, parent_visibility, parent_creator)
       or (parent_visibility = 'private' and parent_creator::text is distinct from new_row->>'created_by')
    then
      raise exception 'That item is not available.';
    end if;
  end if;

  if tg_table_name = 'recipe_ingredients' then
    select recipe.household_id, recipe.visibility, recipe.created_by
      into parent_household, parent_visibility, parent_creator
    from public.recipes as recipe
    where recipe.id = nullif(new_row->>'recipe_id', '')::uuid;
    parent_found := found;
    if tg_op = 'UPDATE'
       and new_row->>'visibility' is distinct from old_row->>'visibility'
       and new_row->>'visibility' = 'private'
       and parent_found
       and parent_creator is distinct from nullif(new_row->>'created_by', '')::uuid then
      raise exception 'others_added' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE'
       and new_row->>'visibility' is distinct from old_row->>'visibility'
       and parent_found
       and not (
         parent_visibility::text = new_row->>'visibility'
         and parent_creator = auth.uid()
       )
       and old_row->>'created_by' is distinct from auth.uid()::text then
      raise exception 'Only the person who added this can change who sees it.';
    end if;
    if not parent_found
       or parent_household::text is distinct from new_row->>'household_id'
       or parent_visibility::text is distinct from new_row->>'visibility'
       or not public.can_access_row(parent_household, parent_visibility, parent_creator)
       or (parent_visibility = 'private' and parent_creator::text is distinct from new_row->>'created_by')
    then
      raise exception 'That recipe is not available.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_household_row() is
  'Blocks household and creator reassignment. Child rows must read their parent. A shared recipe with someone else''s line cannot become Just me.';

-- A direct visibility change keeps ingredient lines on the same key, so the parent check still holds.
create or replace function public.recipes_align_ingredient_visibility()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.visibility is not distinct from old.visibility then
    return new;
  end if;
  update public.recipe_ingredients
     set visibility = new.visibility
   where recipe_id = new.id
     and household_id = new.household_id
     and visibility is distinct from new.visibility;
  return new;
end;
$$;

revoke all on function public.recipes_align_ingredient_visibility() from public, anon;
grant execute on function public.recipes_align_ingredient_visibility() to authenticated;

drop trigger if exists recipes_align_visibility on public.recipes;
create trigger recipes_align_visibility
  after update of visibility on public.recipes
  for each row execute function public.recipes_align_ingredient_visibility();

drop function if exists public.save_household_recipe(jsonb);

create or replace function public.save_household_recipe(p_household_id uuid, p_recipe jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_stamp timestamptz;
  v_visibility public.visibility;
  v_name text;
  v_category text;
  v_servings integer;
  v_steps jsonb;
  v_notes text;
  v_catalog uuid;
  v_count integer;
  v_inserted boolean := false;
  v_meal uuid;
  v_line jsonb;
  v_line_id uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_index integer := 0;
  v_meals jsonb;
begin
  if v_user is null
     or public.household_member_role(p_household_id) is null
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;

  if jsonb_typeof(coalesce(p_recipe->'ingredients', '[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_recipe->'ingredients', '[]'::jsonb)) > 80 then
    raise exception 'That recipe is not available.';
  end if;

  v_name := btrim(coalesce(p_recipe->>'name', ''));
  v_category := nullif(btrim(coalesce(p_recipe->>'category', '')), '');
  v_servings := (p_recipe->>'servings')::integer;
  v_steps := coalesce(p_recipe->'steps', '[]'::jsonb);
  v_notes := nullif(p_recipe->>'notes', '');
  v_visibility := case
    when p_recipe->>'visibility' = 'private' then 'private'::public.visibility
    else 'shared'::public.visibility
  end;
  v_id := nullif(p_recipe->>'id', '')::uuid;
  v_catalog := nullif(p_recipe->>'catalog_recipe_id', '')::uuid;
  v_meal := nullif(p_recipe->>'meal_id', '')::uuid;

  if v_id is not null
     and v_visibility = 'private'
     and exists (
       select 1
       from public.recipe_ingredients as ri
       where ri.recipe_id = v_id
         and ri.household_id = p_household_id
         and ri.created_by is distinct from v_user
     ) then
    return jsonb_build_object('ok', false, 'code', 'others_added');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_recipe->'ingredients', '[]'::jsonb)) as ingredient(value)
    where nullif(ingredient.value->>'id', '') is not null
      and not exists (
        select 1
        from public.recipe_ingredients as ri
        where ri.id = (ingredient.value->>'id')::uuid
          and ri.recipe_id is not distinct from v_id
          and ri.household_id = p_household_id
      )
  ) then
    raise exception 'That recipe is not available.';
  end if;

  if v_id is null then
    insert into public.recipes (
      household_id, created_by, visibility, catalog_recipe_id, name, category, servings, steps, notes
    ) values (
      p_household_id, v_user, v_visibility, v_catalog, v_name, v_category, v_servings, v_steps, v_notes
    )
    returning id into v_id;
    v_inserted := true;
  else
    if nullif(p_recipe->>'updated_at', '') is null then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
    v_stamp := (p_recipe->>'updated_at')::timestamptz;
    update public.recipes
      set name = v_name,
          category = v_category,
          servings = v_servings,
          steps = v_steps,
          notes = v_notes,
          visibility = v_visibility
    where id = v_id
      and household_id = p_household_id
      and updated_at = v_stamp;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
  end if;

  for v_line in
    select ingredient.value
    from jsonb_array_elements(coalesce(p_recipe->'ingredients', '[]'::jsonb)) as ingredient(value)
  loop
    if btrim(coalesce(v_line->>'name', '')) = '' then
      continue;
    end if;
    v_line_id := nullif(v_line->>'id', '')::uuid;
    if v_line_id is not null then
      v_seen := array_append(v_seen, v_line_id);
    end if;
  end loop;

  delete from public.recipe_ingredients as ri
  where ri.recipe_id = v_id
    and ri.household_id = p_household_id
    and not (ri.id = any (v_seen));

  v_index := 0;
  for v_line in
    select ingredient.value
    from jsonb_array_elements(coalesce(p_recipe->'ingredients', '[]'::jsonb)) as ingredient(value)
  loop
    if btrim(coalesce(v_line->>'name', '')) = '' then
      continue;
    end if;
    v_line_id := nullif(v_line->>'id', '')::uuid;
    if v_line_id is null then
      insert into public.recipe_ingredients (
        recipe_id, household_id, created_by, visibility, name, quantity, unit, category, sort_order
      ) values (
        v_id,
        p_household_id,
        v_user,
        v_visibility,
        btrim(v_line->>'name'),
        nullif(btrim(coalesce(v_line->>'quantity', '')), ''),
        nullif(btrim(coalesce(v_line->>'unit', '')), ''),
        nullif(btrim(coalesce(v_line->>'category', '')), ''),
        v_index
      );
    else
      update public.recipe_ingredients
        set name = btrim(v_line->>'name'),
            quantity = nullif(btrim(coalesce(v_line->>'quantity', '')), ''),
            unit = nullif(btrim(coalesce(v_line->>'unit', '')), ''),
            category = nullif(btrim(coalesce(v_line->>'category', '')), ''),
            sort_order = v_index,
            visibility = v_visibility
      where id = v_line_id
        and recipe_id = v_id
        and household_id = p_household_id;
    end if;
    v_index := v_index + 1;
  end loop;

  if v_inserted and v_meal is not null then
    update public.meals
      set recipe_id = v_id,
          catalog_recipe_id = null
    where id = v_meal
      and household_id = p_household_id;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      perform public.sync_meal_shopping(
        p_household_id,
        v_meal,
        coalesce(p_recipe->'shopping_lines', '[]'::jsonb)
      );
    end if;
  end if;

  select coalesce(jsonb_agg(meal.id order by meal.meal_on, meal.slot), '[]'::jsonb)
    into v_meals
  from public.meals as meal
  where meal.recipe_id = v_id
    and meal.household_id = p_household_id
    and meal.meal_on >= current_date
    and meal.meal_on < (date_trunc('week', current_date)::date + 7);

  return jsonb_build_object('ok', true, 'id', v_id, 'meal_ids', coalesce(v_meals, '[]'::jsonb));
end;
$$;

revoke all on function public.save_household_recipe(uuid, jsonb) from public, anon;
grant execute on function public.save_household_recipe(uuid, jsonb) to authenticated;
