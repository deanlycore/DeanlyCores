-- Planner columns on meals. A slot may hold more than one meal.
-- A retried add with the same client_request_id returns the first row.

alter table public.meals
  add column servings integer not null default 1,
  add column recipe_id uuid,
  add column catalog_recipe_id uuid,
  add column client_request_id uuid;

alter table public.meals
  add constraint meals_servings_ck check (servings between 1 and 50),
  add constraint meals_one_recipe_ck check (num_nonnulls(recipe_id, catalog_recipe_id) <= 1),
  add constraint meals_catalog_fk
    foreign key (catalog_recipe_id) references public.catalog_recipes (id) on delete set null;

alter table public.meals
  add constraint meals_recipe_fk
  foreign key (recipe_id, household_id)
  references public.recipes (id, household_id)
  on delete set null (recipe_id);

create unique index meals_visibility_key
  on public.meals (id, household_id, visibility);

create unique index meals_client_request_uidx
  on public.meals (household_id, client_request_id)
  where client_request_id is not null;

create index meals_recipe_idx
  on public.meals (household_id, recipe_id)
  where recipe_id is not null;

revoke all privileges on table public.meals from anon;
revoke truncate, references, trigger on table public.meals from authenticated, anon, public;

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

  return new;
end;
$$;

comment on function public.protect_household_row() is
  'Blocks household and creator reassignment. Child rows must read their parent. A shared meal can use only a shared recipe.';

drop trigger if exists meals_protect on public.meals;
create trigger meals_protect
  before insert or update on public.meals
  for each row execute function public.protect_household_row();
