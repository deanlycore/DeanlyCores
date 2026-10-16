-- One auto amount from one planned meal, or one "add recipe" tap, on one shopping item.
-- Link, meal, and item stay in the same household and the same visibility.
-- A visibility change cannot rewrite a link. Delete still cascades.

alter table public.shopping_items
  add column match_key text;

alter table public.shopping_items
  add constraint shopping_items_match_key_len
  check (match_key is null or char_length(match_key) between 1 and 200);

create unique index shopping_items_visibility_key
  on public.shopping_items (id, household_id, visibility);

create unique index shopping_items_open_auto_uidx
  on public.shopping_items (list_id, match_key)
  where match_key is not null and checked_at is null;

create table public.meal_shopping_needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null,
  source_kind text not null,
  meal_id uuid,
  add_batch_id uuid,
  shopping_item_id uuid not null,
  recipe_ingredient_id uuid references public.recipe_ingredients (id) on delete cascade,
  catalog_ingredient_id uuid references public.catalog_recipe_ingredients (id) on delete cascade,
  match_key text not null,
  amount_raw text,
  qty_base numeric(12, 3),
  unit_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_shopping_needs_source_ck check (source_kind in ('meal', 'recipe_add')),
  constraint meal_shopping_needs_match_len check (char_length(match_key) between 1 and 200),
  constraint meal_shopping_needs_amount_len check (amount_raw is null or char_length(amount_raw) between 1 and 40),
  constraint meal_shopping_needs_qty_ck check (qty_base is null or qty_base > 0),
  constraint meal_shopping_needs_group_ck check (unit_group is null or unit_group in ('mass', 'volume', 'count', 'package')),
  constraint meal_shopping_needs_one_ingredient_ck check (num_nonnulls(recipe_ingredient_id, catalog_ingredient_id) = 1),
  constraint meal_shopping_needs_meal_source_ck check ((source_kind = 'meal') = (meal_id is not null)),
  constraint meal_shopping_needs_batch_source_ck check ((source_kind = 'recipe_add') = (add_batch_id is not null)),
  constraint msn_meal_fk
    foreign key (meal_id, household_id, visibility)
    references public.meals (id, household_id, visibility)
    on update no action
    on delete cascade
    deferrable initially deferred,
  constraint msn_item_fk
    foreign key (shopping_item_id, household_id, visibility)
    references public.shopping_items (id, household_id, visibility)
    on update no action
    on delete cascade
    deferrable initially deferred
);

create unique index msn_meal_ri_uidx
  on public.meal_shopping_needs (meal_id, recipe_ingredient_id)
  where meal_id is not null and recipe_ingredient_id is not null;

create unique index msn_meal_ci_uidx
  on public.meal_shopping_needs (meal_id, catalog_ingredient_id)
  where meal_id is not null and catalog_ingredient_id is not null;

create unique index msn_batch_ri_uidx
  on public.meal_shopping_needs (household_id, add_batch_id, recipe_ingredient_id)
  where add_batch_id is not null and recipe_ingredient_id is not null;

create unique index msn_batch_ci_uidx
  on public.meal_shopping_needs (household_id, add_batch_id, catalog_ingredient_id)
  where add_batch_id is not null and catalog_ingredient_id is not null;

create index meal_shopping_needs_item_idx
  on public.meal_shopping_needs (shopping_item_id);

create index meal_shopping_needs_meal_idx
  on public.meal_shopping_needs (household_id, meal_id);

create index meal_shopping_needs_batch_idx
  on public.meal_shopping_needs (household_id, add_batch_id);

alter table public.meal_shopping_needs enable row level security;
revoke all privileges on table public.meal_shopping_needs from public, anon, authenticated;
grant select, insert, update, delete on table public.meal_shopping_needs to authenticated;
revoke truncate, references, trigger on table public.meal_shopping_needs from authenticated, anon, public;

create trigger meal_shopping_needs_set_updated_at
  before update on public.meal_shopping_needs
  for each row execute function public.set_updated_at();

create policy meal_shopping_needs_select
  on public.meal_shopping_needs
  for select to authenticated
  using (
    public.can_access_row(household_id, visibility, created_by)
    and (
      meal_id is null
      or exists (
        select 1
        from public.meals as meal
        where meal.id = meal_shopping_needs.meal_id
          and public.can_access_row(meal.household_id, meal.visibility, meal.owner_id)
      )
    )
    and exists (
      select 1
      from public.shopping_items as item
      where item.id = meal_shopping_needs.shopping_item_id
        and public.can_access_row(item.household_id, item.visibility, item.owner_id)
    )
  );

create policy meal_shopping_needs_insert
  on public.meal_shopping_needs
  for insert to authenticated
  with check (
    public.can_write_household_content(household_id)
    and created_by = auth.uid()
  );

create policy meal_shopping_needs_update
  on public.meal_shopping_needs
  for update to authenticated
  using (
    public.can_access_row(household_id, visibility, created_by)
    and public.can_write_household_content(household_id)
  )
  with check (
    public.can_write_household_content(household_id)
    and (visibility = 'shared' or created_by = auth.uid())
  );

create policy meal_shopping_needs_delete
  on public.meal_shopping_needs
  for delete to authenticated
  using (
    public.can_access_row(household_id, visibility, created_by)
    and public.can_write_household_content(household_id)
  );

create or replace function public.shopping_items_guard_sync()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if current_setting('deanly.sync_txn', true) = 'on'
     and (
       new.manual_amount_raw is distinct from old.manual_amount_raw
       or new.manual_unit_raw is distinct from old.manual_unit_raw
       or new.manual_qty is distinct from old.manual_qty
       or new.manual_unit is distinct from old.manual_unit
       or new.notes is distinct from old.notes
       or new.price_cents is distinct from old.price_cents
       or new.category is distinct from old.category
       or new.name is distinct from old.name
       or new.user_edited is distinct from old.user_edited
       or new.source is distinct from old.source
       or new.checked_at is distinct from old.checked_at
     ) then
    raise exception 'Sync cannot change that field.';
  end if;
  return new;
end;
$$;

comment on function public.shopping_items_guard_sync() is
  'Tripwire while deanly.sync_txn is on. Not a security boundary: the caller can already write these columns under RLS.';

revoke all on function public.shopping_items_guard_sync() from public, anon;
grant execute on function public.shopping_items_guard_sync() to authenticated;

drop trigger if exists shopping_items_guard_sync on public.shopping_items;
create trigger shopping_items_guard_sync
  before update on public.shopping_items
  for each row execute function public.shopping_items_guard_sync();

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
  meal_recipe uuid;
  meal_catalog uuid;
  ingredient_recipe uuid;
  ingredient_catalog uuid;
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
    if tg_table_name in ('meals', 'shopping_items')
       and new_row->>'visibility' is distinct from old_row->>'visibility'
       and exists (
         select 1
         from public.meal_shopping_needs as link
         where (tg_table_name = 'meals' and link.meal_id = new.id)
            or (tg_table_name = 'shopping_items' and link.shopping_item_id = new.id)
       ) then
      raise exception 'This item is linked to a planned meal, so it stays Shared.';
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

  if tg_table_name = 'meals' and nullif(new_row->>'recipe_id', '') is not null then
    select recipe.household_id, recipe.visibility, recipe.created_by
      into parent_household, parent_visibility, parent_creator
    from public.recipes as recipe
    where recipe.id = (new_row->>'recipe_id')::uuid;
    parent_found := found;
    if not parent_found
       or parent_household::text is distinct from new_row->>'household_id'
       or not public.can_access_row(parent_household, parent_visibility, parent_creator)
       or (new_row->>'visibility' = 'shared' and parent_visibility = 'private')
       or (
         new_row->>'visibility' = 'private'
         and parent_visibility = 'private'
         and parent_creator::text is distinct from new_row->>'owner_id'
       )
    then
      raise exception 'That recipe is not available.';
    end if;
  end if;

  if tg_table_name = 'meal_shopping_needs' then
    select item.household_id, item.visibility, item.owner_id
      into parent_household, parent_visibility, parent_creator
    from public.shopping_items as item
    where item.id = nullif(new_row->>'shopping_item_id', '')::uuid;
    parent_found := found;
    if not parent_found
       or parent_household::text is distinct from new_row->>'household_id'
       or parent_visibility::text is distinct from new_row->>'visibility'
       or not public.can_access_row(parent_household, parent_visibility, parent_creator)
       or (new_row->>'visibility' = 'private' and parent_creator::text is distinct from new_row->>'created_by')
    then
      raise exception 'That item is not available.';
    end if;

    meal_recipe := null;
    meal_catalog := null;
    if nullif(new_row->>'meal_id', '') is not null then
      select meal.household_id, meal.visibility, meal.owner_id, meal.recipe_id, meal.catalog_recipe_id
        into parent_household, parent_visibility, parent_creator, meal_recipe, meal_catalog
      from public.meals as meal
      where meal.id = (new_row->>'meal_id')::uuid;
      parent_found := found;
      if not parent_found
         or parent_household::text is distinct from new_row->>'household_id'
         or parent_visibility::text is distinct from new_row->>'visibility'
         or not public.can_access_row(parent_household, parent_visibility, parent_creator)
         or (new_row->>'visibility' = 'private' and parent_creator::text is distinct from new_row->>'created_by')
      then
        raise exception 'That item is not available.';
      end if;
    end if;

    if nullif(new_row->>'recipe_ingredient_id', '') is not null then
      select recipe.id, recipe.household_id, recipe.visibility, recipe.created_by
        into ingredient_recipe, parent_household, parent_visibility, parent_creator
      from public.recipe_ingredients as ri
      join public.recipes as recipe on recipe.id = ri.recipe_id
      where ri.id = (new_row->>'recipe_ingredient_id')::uuid;
      parent_found := found;
      if not parent_found
         or parent_household::text is distinct from new_row->>'household_id'
         or (new_row->>'visibility' = 'shared' and parent_visibility = 'private')
         or (
           new_row->>'visibility' = 'private'
           and parent_visibility = 'private'
           and parent_creator::text is distinct from new_row->>'created_by'
         )
         or (nullif(new_row->>'meal_id', '') is not null and meal_recipe is distinct from ingredient_recipe)
         or (
           nullif(new_row->>'meal_id', '') is null
           and not public.can_access_row(parent_household, parent_visibility, parent_creator)
         )
      then
        raise exception 'That item is not available.';
      end if;
    end if;

    if nullif(new_row->>'catalog_ingredient_id', '') is not null then
      select line.catalog_recipe_id
        into ingredient_catalog
      from public.catalog_recipe_ingredients as line
      where line.id = (new_row->>'catalog_ingredient_id')::uuid;
      parent_found := found;
      if not parent_found
         or (nullif(new_row->>'meal_id', '') is not null and meal_catalog is distinct from ingredient_catalog)
      then
        raise exception 'That item is not available.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_household_row() is
  'Blocks household and creator reassignment. Child rows must read their parent. Linked meals and items stay Shared. A shared link cannot point at a private recipe.';

drop trigger if exists meal_shopping_needs_protect on public.meal_shopping_needs;
create trigger meal_shopping_needs_protect
  before insert or update on public.meal_shopping_needs
  for each row execute function public.protect_household_row();
