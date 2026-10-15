-- Shopping upgrade. Lists, item fields, pantry rows, and read-only unit and ingredient aliases.
-- Anon has no select on the alias tables. Does not add a security definer function.
-- Child rows must be able to read their parent. A missing parent and a hidden parent use the same error.

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 40),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index shopping_lists_shared_name_uidx
  on public.shopping_lists (household_id, lower(name))
  where visibility = 'shared';

create unique index shopping_lists_private_name_uidx
  on public.shopping_lists (household_id, created_by, lower(name))
  where visibility = 'private';

create unique index shopping_lists_shared_default_uidx
  on public.shopping_lists (household_id)
  where visibility = 'shared' and is_default;

create unique index shopping_lists_private_default_uidx
  on public.shopping_lists (household_id, created_by)
  where visibility = 'private' and is_default;

create unique index shopping_lists_visibility_key
  on public.shopping_lists (id, household_id, visibility);

alter table public.shopping_items
  add column list_id uuid,
  add column qty numeric(8, 2),
  add column unit text,
  add column price_cents integer,
  add column notes text,
  add column system_note text,
  add column category text not null default 'other',
  add column source text not null default 'manual',
  add column user_edited boolean not null default false;

alter table public.shopping_items
  add constraint shopping_items_qty_ok check (qty is null or (qty > 0 and qty <= 9999)),
  add constraint shopping_items_unit_len check (unit is null or char_length(btrim(unit)) between 1 and 24),
  add constraint shopping_items_price_ok check (price_cents is null or (price_cents >= 0 and price_cents <= 100000000)),
  add constraint shopping_items_notes_len check (notes is null or char_length(notes) <= 500),
  add constraint shopping_items_system_note_len check (system_note is null or char_length(system_note) <= 200),
  add constraint shopping_items_category_ok check (
    category in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'other')
  ),
  add constraint shopping_items_source_ok check (source in ('manual', 'auto'));

insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
select distinct on (household_id)
  household_id,
  owner_id,
  'shared'::public.visibility,
  'Groceries',
  true
from public.shopping_items
where visibility = 'shared'
order by household_id, created_at asc;

insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
select household_id, owner_id, 'private'::public.visibility, 'Groceries', true
from public.shopping_items
where visibility = 'private'
group by household_id, owner_id;

update public.shopping_items as item
set list_id = list.id,
    category = 'other',
    source = 'manual',
    user_edited = false
from public.shopping_lists as list
where item.list_id is null
  and list.household_id = item.household_id
  and list.visibility = item.visibility
  and list.is_default
  and (item.visibility = 'shared' or list.created_by = item.owner_id);

alter table public.shopping_items
  alter column list_id set not null;

alter table public.shopping_items
  add constraint shopping_items_list_fk
  foreign key (list_id, household_id, visibility)
  references public.shopping_lists (id, household_id, visibility)
  on update no action
  on delete cascade;

create index shopping_items_list_idx
  on public.shopping_items (list_id, checked_at, name);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 140),
  qty numeric(8, 2),
  unit text,
  category text not null default 'other',
  notes text,
  shopping_item_id uuid references public.shopping_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pantry_items_qty_ok check (qty is null or (qty > 0 and qty <= 9999)),
  constraint pantry_items_unit_len check (unit is null or char_length(btrim(unit)) between 1 and 24),
  constraint pantry_items_notes_len check (notes is null or char_length(notes) <= 500),
  constraint pantry_items_category_ok check (
    category in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'other')
  )
);

create index pantry_items_household_idx
  on public.pantry_items (household_id, lower(name));

create table public.unit_aliases (
  alias text primary key,
  canonical text not null,
  unit_group text not null check (unit_group in ('mass', 'volume', 'count', 'package')),
  to_base numeric not null check (to_base > 0)
);

create table public.ingredient_aliases (
  alias text primary key,
  canonical text not null,
  is_staple boolean not null default false
);

insert into public.unit_aliases (alias, canonical, unit_group, to_base) values
  ('g', 'g', 'mass', 1),
  ('gram', 'g', 'mass', 1),
  ('grams', 'g', 'mass', 1),
  ('kg', 'kg', 'mass', 1000),
  ('kilogram', 'kg', 'mass', 1000),
  ('kilograms', 'kg', 'mass', 1000),
  ('ml', 'ml', 'volume', 1),
  ('l', 'l', 'volume', 1000),
  ('cup', 'cup', 'volume', 240),
  ('cups', 'cup', 'volume', 240),
  ('each', 'each', 'count', 1),
  ('pack', 'pack', 'package', 1);

insert into public.ingredient_aliases (alias, canonical, is_staple) values
  ('salt', 'salt', true),
  ('pepper', 'pepper', true),
  ('oil', 'oil', true),
  ('water', 'water', true);

create or replace function public.protect_household_row()
returns trigger
language plpgsql
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
    if new_row->>'visibility' is distinct from old_row->>'visibility'
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

  return new;
end;
$$;

comment on function public.protect_household_row() is
  'Blocks household and creator reassignment. Child rows must read their parent. Missing and hidden parents raise the same error.';

do $$
declare
  t text;
begin
  foreach t in array array['shopping_lists', 'pantry_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated, anon, public', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at',
      t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_protect', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.protect_household_row()',
      t || '_protect',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_row(household_id, visibility, created_by))',
      t || '_select',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_write_household_content(household_id) and created_by = auth.uid())',
      t || '_insert',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_row(household_id, visibility, created_by) and public.can_write_household_content(household_id)) with check (public.can_write_household_content(household_id) and (visibility = ''shared'' or created_by = auth.uid()))',
      t || '_update',
      t
    );
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_row(household_id, visibility, created_by) and public.can_write_household_content(household_id))',
      t || '_delete',
      t
    );
  end loop;
end $$;

drop trigger if exists shopping_items_protect on public.shopping_items;
create trigger shopping_items_protect
  before insert or update on public.shopping_items
  for each row execute function public.protect_household_row();

revoke all on table public.unit_aliases from public, anon, authenticated;
revoke all on table public.ingredient_aliases from public, anon, authenticated;
grant select on table public.unit_aliases to authenticated;
grant select on table public.ingredient_aliases to authenticated;

alter table public.unit_aliases enable row level security;
alter table public.ingredient_aliases enable row level security;

create policy unit_aliases_select
  on public.unit_aliases
  for select to authenticated
  using (true);

create policy ingredient_aliases_select
  on public.ingredient_aliases
  for select to authenticated
  using (true);

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

  -- created_by tables. recipes, recipe_ingredients, substitutions, and meal_shopping_needs
  -- join this list in the migration that creates them. recipe_favorites deletes by user_id.
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
  'Trigger only. Removes one login''s private rows when their membership is deleted. Shared rows stay. Vault files stay in storage.';

revoke all on function public.protect_household_member_delete() from public, anon, authenticated, service_role;
