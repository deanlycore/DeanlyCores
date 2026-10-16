-- Slice 3 tests 1–28 against a local database. Fixture ids live only in this file.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'v@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'c@example.com');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.households (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'H1', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'H2', '44444444-4444-4444-8444-444444444444');
insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'adult');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'adult');

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'view_only');

-- Test 5. Invoker, fixed search_path, authenticated only.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'save_household_recipe',
        'save_planned_meal',
        'remove_planned_meal',
        'sync_meal_shopping',
        'add_recipe_to_shopping',
        'recompute_shopping_item_auto',
        'keep_or_delete_shopping_item',
        'shopping_items_guard_sync',
        'recipes_align_ingredient_visibility'
      )
  loop
    if fn.prosecdef then
      raise exception 'test 5 % is security definer', fn.proname;
    end if;
    if fn.proconfig is null or not ('search_path=public' = any (fn.proconfig)) then
      raise exception 'test 5 % search_path %', fn.proname, fn.proconfig;
    end if;
    if not has_function_privilege('authenticated', fn.oid, 'execute') then
      raise exception 'test 5 % missing authenticated execute', fn.proname;
    end if;
    if has_function_privilege('anon', fn.oid, 'execute') or has_function_privilege('public', fn.oid, 'execute') then
      raise exception 'test 5 % is executable outside authenticated', fn.proname;
    end if;
  end loop;
  if exists (select 1 from pg_proc where proname = '_apply_shopping_lines') then
    raise exception 'test 27 _apply_shopping_lines exists';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'save_household_recipe'
      and pg_get_function_identity_arguments(oid) = 'jsonb'
  ) then
    raise exception 'test 8 old save_household_recipe(jsonb) still exists';
  end if;
end $$;

-- Test 8. Household argument, not the first membership.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '{"name":"H2 stew","servings":2,"visibility":"shared","steps":[],"ingredients":[{"name":"Onion","quantity":"1","unit":"each","category":"produce"}]}'::jsonb
) as h2_save \gset
do $$
begin
  if not exists (
    select 1 from public.recipes
    where household_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'H2 stew'
  ) then
    raise exception 'test 8 recipe did not land in H2';
  end if;
end $$;
do $$
begin
  perform public.save_household_recipe(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '{"name":"Nope","servings":1,"visibility":"shared","steps":[],"ingredients":[]}'::jsonb
  );
  raise exception 'test 8 foreign household should fail';
exception when others then
  if position('access' in sqlerrm) = 0 then
    raise exception 'test 8 unexpected %', sqlerrm;
  end if;
end $$;
reset role;

-- Shared recipe with two lines, then B adds a third. Tests 9, 10, 28.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"Shared tacos","servings":4,"visibility":"shared","steps":[],"ingredients":[{"name":"Onion","quantity":"2","unit":"each","category":"produce"},{"name":"Tortilla","quantity":"8","unit":"each","category":"bakery"}]}'::jsonb
) as made \gset
reset role;

-- Test 9. B renames line 1 and adds line 3. Original creators stay.
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select (
  select jsonb_build_object(
    'id', recipe.id,
    'updated_at', recipe.updated_at,
    'name', recipe.name,
    'servings', recipe.servings,
    'visibility', recipe.visibility,
    'steps', recipe.steps,
    'ingredients', (
      select jsonb_agg(jsonb_build_object(
        'id', line.id, 'name', case when line.sort_order = 0 then 'Yellow onion' else line.name end,
        'quantity', line.quantity, 'unit', line.unit, 'category', line.category
      ) order by line.sort_order) || jsonb_build_array(jsonb_build_object('name','Lime','quantity','1','unit','each','category','produce'))
      from public.recipe_ingredients as line
      where line.recipe_id = recipe.id
    )
  )
  from public.recipes as recipe
  where recipe.name = 'Shared tacos'
) as b_edit \gset
select public.save_household_recipe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :'b_edit'::jsonb) as b_saved \gset
do $$
declare
  creators text;
begin
  select string_agg(line.created_by::text, ',' order by line.sort_order) into creators
  from public.recipe_ingredients as line
  join public.recipes as recipe on recipe.id = line.recipe_id
  where recipe.name = 'Shared tacos';
  if creators is distinct from '11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222' then
    raise exception 'test 9 creators %', creators;
  end if;
  if (select count(*) from public.recipe_ingredients line join public.recipes recipe on recipe.id = line.recipe_id where recipe.name = 'Shared tacos' and line.name = 'Yellow onion') <> 1 then
    raise exception 'test 9 rename missing';
  end if;
end $$;
reset role;

-- Test 10 and 28. Shared to Just me is blocked while B's line exists.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (
    select jsonb_build_object(
      'id', recipe.id, 'updated_at', recipe.updated_at, 'name', recipe.name, 'servings', recipe.servings,
      'visibility', 'private', 'steps', recipe.steps,
      'ingredients', (select jsonb_agg(jsonb_build_object('id', line.id, 'name', line.name, 'quantity', line.quantity, 'unit', line.unit, 'category', line.category) order by line.sort_order) from public.recipe_ingredients line where line.recipe_id = recipe.id)
    )
    from public.recipes as recipe where recipe.name = 'Shared tacos'
  )
) as blocked \gset
select set_config('slice3.blocked', :'blocked', true);
do $$
begin
  if current_setting('slice3.blocked')::jsonb->>'code' is distinct from 'others_added' then
    raise exception 'test 10 code %', current_setting('slice3.blocked');
  end if;
  if (select visibility::text from public.recipes where name = 'Shared tacos') is distinct from 'shared' then
    raise exception 'test 10 recipe changed';
  end if;
end $$;
do $$
declare
  line_id uuid;
begin
  select line.id into line_id
  from public.recipe_ingredients as line
  join public.recipes as recipe on recipe.id = line.recipe_id
  where recipe.name = 'Shared tacos' and line.created_by = '22222222-2222-4222-8222-222222222222';
  update public.recipe_ingredients set visibility = 'private' where id = line_id;
  raise exception 'test 10 ingredient update should fail';
exception when others then
  if sqlerrm is distinct from 'others_added' then
    raise exception 'test 10 ingredient %', sqlerrm;
  end if;
end $$;
do $$
begin
  update public.recipes set visibility = 'private'
  where name = 'Shared tacos';
  raise exception 'test 28 direct recipe update should fail';
exception when others then
  if sqlerrm is distinct from 'others_added' then
    raise exception 'test 28 %', sqlerrm;
  end if;
end $$;
do $$
begin
  if (select visibility::text from public.recipes where name = 'Shared tacos') is distinct from 'shared' then
    raise exception 'test 28 recipe changed';
  end if;
  if exists (
    select 1 from public.recipe_ingredients line
    join public.recipes recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.visibility = 'private'
  ) then
    raise exception 'test 28 lines changed';
  end if;
end $$;
reset role;

-- A's own recipe can become Just me. Test 28 success, and test 6 setup.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"A private","servings":2,"visibility":"private","steps":[],"ingredients":[{"name":"Egg","quantity":"2","unit":"each","category":"dairy"}]}'::jsonb
) as a_private \gset
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"A shared only","servings":2,"visibility":"shared","steps":[],"ingredients":[{"name":"Rice","quantity":"1","unit":"cup","category":"pantry"}]}'::jsonb
) as a_only \gset
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.recipes where name = 'A shared only';
  update public.recipes set visibility = 'private' where id = target_id;
  if (select visibility::text from public.recipes where id = target_id) is distinct from 'private' then
    raise exception 'test 28 allowed update failed';
  end if;
  if exists (select 1 from public.recipe_ingredients where recipe_id = target_id and visibility::text is distinct from 'private') then
    raise exception 'test 28 lines did not follow';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"B private","servings":1,"visibility":"private","steps":[],"ingredients":[{"name":"Yogurt","quantity":"1","unit":"cup","category":"dairy"}]}'::jsonb
) as b_private \gset
reset role;

-- Test 6. Recipe parent check on meals.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('slice3.b_recipe', (:'b_private'::jsonb->>'id'), true);
select set_config('slice3.a_recipe', (:'a_private'::jsonb->>'id'), true);
do $$
declare
  shared_meal uuid := gen_random_uuid();
  b_recipe uuid := current_setting('slice3.b_recipe')::uuid;
  a_recipe uuid := current_setting('slice3.a_recipe')::uuid;
begin
  begin
    insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, recipe_id)
    values (shared_meal, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Bad', current_date, 'dinner', b_recipe);
    raise exception 'test 6 shared meal accepted a private recipe';
  exception when others then
    if position('not available' in sqlerrm) = 0 then
      raise exception 'test 6 shared/private %', sqlerrm;
    end if;
  end;
  begin
    insert into public.meals (household_id, owner_id, visibility, title, meal_on, slot, recipe_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'private', 'Hidden', current_date, 'dinner', b_recipe);
    raise exception 'test 6 private meal accepted B recipe';
  exception when others then
    if position('not available' in sqlerrm) = 0 then
      raise exception 'test 6 hidden %', sqlerrm;
    end if;
  end;
  begin
    insert into public.meals (household_id, owner_id, visibility, title, meal_on, slot, recipe_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'private', 'Missing', current_date, 'dinner', gen_random_uuid());
    raise exception 'test 6 missing recipe accepted';
  exception when others then
    if position('not available' in sqlerrm) = 0 then
      raise exception 'test 6 missing %', sqlerrm;
    end if;
  end;
  insert into public.meals (household_id, owner_id, visibility, title, meal_on, slot, recipe_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'private', 'Mine', current_date, 'lunch', a_recipe);
end $$;
reset role;

-- Plan a shared meal and sync. Tests 12, 14, 17, 18, 19, 24.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Manual item that sync must not rewrite.
insert into public.shopping_lists (id, household_id, created_by, visibility, name, is_default)
values ('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Groceries', true);
insert into public.shopping_items (
  id, household_id, owner_id, visibility, list_id, name, category, source, user_edited,
  manual_amount_raw, manual_unit_raw, manual_qty, manual_unit, notes, price_cents
) values (
  'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared',
  'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1',
  'Olive oil', 'pantry', 'manual', true,
  '1', 'l', 1, 'l', 'keep me', 399
);

select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object(
    'title', 'Tacos', 'meal_on', current_date, 'slot', 'dinner', 'servings', 4, 'visibility', 'shared',
    'recipe_id', (select id from public.recipes where name = 'Shared tacos'),
    'client_request_id', 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1'
  ),
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', case when line.name = 'Yellow onion' then 'onion|count' else lower(line.name) || '|count' end,
      'amount_raw', line.quantity,
      'qty_base', line.quantity::numeric, 'unit_group', 'count', 'canonical_unit', 'each'
    ) order by line.sort_order)
    from public.recipe_ingredients as line
    join public.recipes as recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.name <> 'Lime'
  ),
  true
) as first_sync \gset

select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object(
    'title', 'Tacos again', 'meal_on', current_date, 'slot', 'dinner', 'servings', 4, 'visibility', 'shared',
    'recipe_id', (select id from public.recipes where name = 'Shared tacos'),
    'client_request_id', 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1'
  ),
  '[]'::jsonb,
  true
) as replay \gset

select public.add_recipe_to_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9',
  (select id from public.recipes where name = 'A private'),
  null,
  2,
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', 'egg|count', 'amount_raw', '2', 'qty_base', 2, 'unit_group', 'count', 'canonical_unit', 'each'
    ))
    from public.recipe_ingredients as line
    join public.recipes as recipe on recipe.id = line.recipe_id
    where recipe.name = 'A private'
  )
) as just_me \gset

select public.add_recipe_to_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9',
  (select id from public.recipes where name = 'A private'),
  null,
  2,
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', 'egg|count', 'amount_raw', '2', 'qty_base', 2, 'unit_group', 'count', 'canonical_unit', 'each'
    ))
    from public.recipe_ingredients as line
    join public.recipes as recipe on recipe.id = line.recipe_id
    where recipe.name = 'A private'
  )
) as just_me_again \gset

select set_config('slice3.replay', :'replay', true);
select set_config('slice3.first_sync', :'first_sync', true);
do $$
declare
  meals integer;
  links integer;
  eggs integer;
  onions integer;
begin
  if current_setting('slice3.replay')::jsonb->>'replayed' is distinct from 'true' then
    raise exception 'test 12 replay %', current_setting('slice3.replay');
  end if;
  select count(*) into meals from public.meals where client_request_id = 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1';
  if meals <> 1 then
    raise exception 'test 12 meals %', meals;
  end if;
  select count(*) into links
  from public.meal_shopping_needs
  where meal_id = (current_setting('slice3.first_sync')::jsonb->>'id')::uuid;
  if links <> 2 then
    raise exception 'test 12 links %', links;
  end if;
  select count(*) into onions from public.shopping_items where match_key = 'onion|count' and checked_at is null;
  if onions <> 1 then
    raise exception 'test 12 onion items %', onions;
  end if;
  select count(*) into eggs from public.shopping_items where match_key = 'egg|count' and checked_at is null;
  if eggs <> 1 then
    raise exception 'test 12 egg items %', eggs;
  end if;
  if (
    select list.visibility::text
    from public.shopping_items as item
    join public.shopping_lists as list on list.id = item.list_id
    where item.match_key = 'egg|count'
  ) is distinct from 'private' then
    raise exception 'test 22 private recipe did not land on the Just me list';
  end if;
  if exists (
    select 1 from public.shopping_items as item
    join public.shopping_lists as list on list.id = item.list_id
    where item.match_key = 'egg|count' and list.visibility = 'shared'
  ) then
    raise exception 'test 22 private recipe wrote the shared list';
  end if;
end $$;

-- Test 22 shared recipe is on the shared list. Test 14 manual columns.
do $$
declare
  snap text;
begin
  if (
    select list.visibility::text
    from public.shopping_items as item
    join public.shopping_lists as list on list.id = item.list_id
    where item.match_key = 'onion|count'
  ) is distinct from 'shared' then
    raise exception 'test 22 shared recipe missed the shared list';
  end if;
  select concat_ws('|', manual_amount_raw, manual_unit_raw, manual_qty::text, manual_unit, notes, price_cents::text, category, name, coalesce(checked_at::text, ''), user_edited::text, source)
    into snap
  from public.shopping_items
  where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1';
  if snap is distinct from '1|l|1.00|l|keep me|399|pantry|Olive oil||true|manual' then
    raise exception 'test 14 before %', snap;
  end if;
end $$;

-- Test 17. 4 to 8 servings doubles the count. Mixed groups null the auto amount.
select public.sync_meal_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (current_setting('slice3.first_sync')::jsonb->>'id')::uuid,
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', case when line.name = 'Yellow onion' then 'onion|mixed' else lower(line.name) || '|count' end,
      'amount_raw', (line.quantity::numeric * 2)::text,
      'qty_base', line.quantity::numeric * 2,
      'unit_group', case when line.name = 'Yellow onion' then 'mass' else 'count' end,
      'canonical_unit', 'each'
    ))
    from public.recipe_ingredients as line
    join public.recipes as recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.name <> 'Lime'
  )
) as doubled \gset

-- Put a second unit group on the onion item.
insert into public.meal_shopping_needs (
  household_id, created_by, visibility, source_kind, add_batch_id, shopping_item_id,
  recipe_ingredient_id, match_key, amount_raw, qty_base, unit_group
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'recipe_add',
  'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8',
  item.id, line.id, 'onion|mixed', '1', 50, 'volume'
from public.shopping_items as item
join public.recipe_ingredients as line on line.name = 'Yellow onion'
where item.match_key = 'onion|mixed';

select public.recompute_shopping_item_auto(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select id from public.shopping_items where match_key = 'onion|mixed')
);

do $$
declare
  tortilla numeric;
  onion numeric;
begin
  select auto_qty into tortilla from public.shopping_items where match_key = 'tortilla|count';
  if tortilla is distinct from 16 then
    raise exception 'test 17 tortilla %', tortilla;
  end if;
  select auto_qty into onion from public.shopping_items where match_key = 'onion|mixed';
  if onion is not null then
    raise exception 'test 17 mixed auto_qty %', onion;
  end if;
end $$;

-- Test 24. Second identical sync changes nothing, including updated_at.
select jsonb_agg(to_jsonb(item) order by item.id) as items_before
from public.shopping_items as item
where item.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' \gset
select jsonb_agg(to_jsonb(link) order by link.id) as links_before
from public.meal_shopping_needs as link
where link.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' \gset
select public.sync_meal_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (current_setting('slice3.first_sync')::jsonb->>'id')::uuid,
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', case when line.name = 'Yellow onion' then 'onion|mixed' else lower(line.name) || '|count' end,
      'amount_raw', (line.quantity::numeric * 2)::text,
      'qty_base', line.quantity::numeric * 2,
      'unit_group', case when line.name = 'Yellow onion' then 'mass' else 'count' end
    ))
    from public.recipe_ingredients as line
    join public.recipes as recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.name <> 'Lime'
  )
) as second_sync \gset
select set_config('slice3.second_sync', :'second_sync', true);
select set_config('slice3.items_before', :'items_before', true);
select set_config('slice3.links_before', :'links_before', true);
do $$
declare
  items_after jsonb;
  links_after jsonb;
begin
  if (current_setting('slice3.second_sync')::jsonb->>'added')::int <> 0
     or (current_setting('slice3.second_sync')::jsonb->>'updated')::int <> 0
     or (current_setting('slice3.second_sync')::jsonb->>'removed')::int <> 0 then
    raise exception 'test 24 counts %', current_setting('slice3.second_sync');
  end if;
  select jsonb_agg(to_jsonb(item) order by item.id) into items_after
  from public.shopping_items as item
  where item.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select jsonb_agg(to_jsonb(link) order by link.id) into links_after
  from public.meal_shopping_needs as link
  where link.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if items_after is distinct from current_setting('slice3.items_before')::jsonb
     or links_after is distinct from current_setting('slice3.links_before')::jsonb then
    raise exception 'test 24 rows moved';
  end if;
end $$;

-- Test 14 continued, 18, 19.
select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object('title','Leftovers','meal_on', current_date, 'slot','lunch','servings',1,'visibility','shared','client_request_id','c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'),
  '[]'::jsonb,
  true
) as free_text \gset
select set_config('slice3.free_text', :'free_text', true);
do $$
begin
  if exists (select 1 from public.meal_shopping_needs where meal_id = (current_setting('slice3.free_text')::jsonb->>'id')::uuid) then
    raise exception 'test 19 free-text created links';
  end if;
end $$;

-- Checked auto item and a second meal that still needs tortilla.
update public.shopping_items set checked_at = now() where match_key = 'tortilla|count';
select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object(
    'title','Tacos later','meal_on', current_date + 1, 'slot','dinner','servings',4,'visibility','shared',
    'recipe_id', (select id from public.recipes where name = 'Shared tacos'),
    'client_request_id','d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2'
  ),
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', 'tortilla|count', 'amount_raw', '4', 'qty_base', 4, 'unit_group', 'count',
      'shopping_item_id', (select id from public.shopping_items where match_key = 'tortilla|count')
    ))
    from public.recipe_ingredients line
    join public.recipes recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.name = 'Tortilla'
  ),
  true
) as second_meal \gset
select set_config('slice3.second_meal', :'second_meal', true);

select meal.updated_at as first_stamp
from public.meals as meal
where meal.id = (:'first_sync'::jsonb->>'id')::uuid \gset

delete from public.meal_shopping_needs
where add_batch_id = 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8';

select public.remove_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (current_setting('slice3.first_sync')::jsonb->>'id')::uuid,
  :'first_stamp'::timestamptz
) as removed_meal \gset

do $$
declare
  note text;
  oil text;
  tortilla numeric;
begin
  if exists (select 1 from public.shopping_items where match_key = 'onion|mixed') then
    raise exception 'test 18 auto item was kept';
  end if;
  select system_note into note from public.shopping_items where match_key = 'tortilla|count';
  -- Tortilla is still needed by the second meal, so it stays and is recomputed, not noted.
  select auto_qty into tortilla from public.shopping_items where match_key = 'tortilla|count';
  if tortilla is null then
    raise exception 'test 18 shared item lost its amount';
  end if;
  select concat_ws('|', manual_amount_raw, manual_unit_raw, manual_qty::text, manual_unit, notes, price_cents::text, category, name, coalesce(checked_at::text, ''), user_edited::text, source)
    into oil
  from public.shopping_items where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1';
  if oil not like '1|l|1.00|l|keep me|399|pantry|Olive oil|%|true|manual' then
    raise exception 'test 14 after %', oil;
  end if;
  if (select auto_qty from public.shopping_items where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1') is not null then
    raise exception 'test 18 manual auto_qty not cleared';
  end if;
end $$;

-- A checked auto item with no remaining meal is noted. Use a fresh one-off meal.
select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object(
    'title','Eggs tonight','meal_on', current_date, 'slot','breakfast','servings',2,'visibility','private',
    'recipe_id', (select id from public.recipes where name = 'A private'),
    'client_request_id','e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3'
  ),
  (
    select jsonb_agg(jsonb_build_object(
      'recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', 'egg|count', 'amount_raw', '2', 'qty_base', 2, 'unit_group', 'count'
    ))
    from public.recipe_ingredients line
    join public.recipes recipe on recipe.id = line.recipe_id
    where recipe.name = 'A private'
  ),
  false
) as egg_meal \gset

-- The private egg item already exists from the recipe add. Point a meal at a new checked auto row.
insert into public.shopping_items (
  id, household_id, owner_id, visibility, list_id, name, category, source, user_edited, match_key, checked_at
)
select 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4', household_id, created_by, 'private', id, 'Checked beans', 'pantry', 'auto', false, 'bean|count', now()
from public.shopping_lists
where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and visibility = 'private' and is_default and created_by = auth.uid();

insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, recipe_id)
values (
  'abababab-abab-4aba-8aba-abababababab',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  auth.uid(),
  'private',
  'Beans',
  current_date,
  'snack',
  (select id from public.recipes where name = 'A private')
);
insert into public.meal_shopping_needs (
  household_id, created_by, visibility, source_kind, meal_id, shopping_item_id, recipe_ingredient_id, match_key, qty_base, unit_group
)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'private', 'meal', 'abababab-abab-4aba-8aba-abababababab',
  'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4', line.id, 'bean|count', 1, 'count'
from public.recipe_ingredients as line
join public.recipes as recipe on recipe.id = line.recipe_id
where recipe.name = 'A private';

select updated_at as bean_stamp from public.meals where id = 'abababab-abab-4aba-8aba-abababababab' \gset
select public.remove_planned_meal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'abababab-abab-4aba-8aba-abababababab', :'bean_stamp'::timestamptz);
do $$
declare
  note text;
begin
  select system_note into note from public.shopping_items where id = 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4';
  if note is distinct from 'No longer needed for a meal. Left on the list.' then
    raise exception 'test 18 note %', note;
  end if;
  if (select auto_qty from public.shopping_items where id = 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4') is not null then
    raise exception 'test 18 checked auto_qty';
  end if;
end $$;

-- Test 15. Guard rejects a manual write inside the sync transaction.
do $$
begin
  perform set_config('deanly.sync_txn', 'on', true);
  update public.shopping_items set manual_qty = 9 where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1';
  raise exception 'test 15 should have raised';
exception when others then
  if position('Sync cannot change' in sqlerrm) = 0 then
    raise exception 'test 15 %', sqlerrm;
  end if;
end $$;

-- Test 23. Shared link cannot point at a private recipe line.
do $$
declare
  line_id uuid;
  item_id uuid;
begin
  select line.id into line_id
  from public.recipe_ingredients as line
  join public.recipes as recipe on recipe.id = line.recipe_id
  where recipe.name = 'A private';
  select id into item_id from public.shopping_items where match_key = 'onion|count';
  insert into public.meal_shopping_needs (
    household_id, created_by, visibility, source_kind, add_batch_id, shopping_item_id, recipe_ingredient_id, match_key, qty_base, unit_group
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'recipe_add', gen_random_uuid(), item_id, line_id, 'egg|count', 1, 'count'
  );
  raise exception 'test 23 should have rejected the link';
exception when others then
  if position('not available' in sqlerrm) = 0 then
    raise exception 'test 23 %', sqlerrm;
  end if;
end $$;

-- Test 26. Visibility change is blocked, and the deferred FK is NO ACTION.
do $$
declare
  updtype "char";
  is_deferrable boolean;
  is_deferred boolean;
begin
  select confupdtype, condeferrable, condeferred
    into updtype, is_deferrable, is_deferred
  from pg_constraint where conname = 'msn_meal_fk';
  if updtype is distinct from 'a' or not is_deferrable or not is_deferred then
    raise exception 'test 26 meal fk % % %', updtype, is_deferrable, is_deferred;
  end if;
  select confupdtype, condeferrable, condeferred
    into updtype, is_deferrable, is_deferred
  from pg_constraint where conname = 'msn_item_fk';
  if updtype is distinct from 'a' or not is_deferrable or not is_deferred then
    raise exception 'test 26 item fk % % %', updtype, is_deferrable, is_deferred;
  end if;
end $$;
do $$
begin
  update public.meals
    set visibility = 'private'
  where id = (current_setting('slice3.second_meal')::jsonb->>'id')::uuid;
  raise exception 'test 26 meal visibility should fail';
exception when others then
  if sqlerrm is distinct from 'This item is linked to a planned meal, so it stays Shared.' then
    raise exception 'test 26 trigger %', sqlerrm;
  end if;
end $$;
reset role;
alter table public.meals disable trigger meals_protect;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set constraints all immediate;
do $$
begin
  update public.meals
    set visibility = 'private'
  where id = (current_setting('slice3.second_meal')::jsonb->>'id')::uuid;
  raise exception 'test 26 fk should fail';
exception when sqlstate '23503' then
  null;
end $$;
reset role;
alter table public.meals enable trigger meals_protect;

-- Test 27. Rejections, and both entry points agree.
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
do $$
begin
  perform public.sync_meal_shopping('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), '[]'::jsonb);
  raise exception 'test 27 view-only sync';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 27 sync view %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.add_recipe_to_shopping('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), gen_random_uuid(), null, 1, '[]'::jsonb);
  raise exception 'test 27 view-only add';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 27 add view %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.save_planned_meal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"title":"X","meal_on":"2026-10-16","slot":"dinner"}'::jsonb, '[]'::jsonb, false);
  raise exception 'test 27 view-only save';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 27 save view %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.remove_planned_meal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), now());
  raise exception 'test 27 view-only remove';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 27 remove view %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.save_household_recipe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"name":"X","servings":1,"ingredients":[]}'::jsonb);
  raise exception 'test 27 view-only recipe';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 27 recipe view %', sqlerrm; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare
  many jsonb;
begin
  select jsonb_agg(jsonb_build_object('name','Spice','quantity','1','unit','each','category','pantry')) into many from generate_series(1, 81);
  perform public.save_household_recipe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', jsonb_build_object('name','Too many','servings',1,'ingredients', many));
  raise exception 'test 27 81 recipe lines';
exception when others then
  if position('not available' in sqlerrm) = 0 then raise exception 'test 27 81 recipe %', sqlerrm; end if;
end $$;
do $$
declare
  many jsonb;
  recipe_id uuid;
begin
  select id into recipe_id from public.recipes where name = 'Shared tacos';
  select jsonb_agg(jsonb_build_object('recipe_ingredient_id', gen_random_uuid(), 'name','Onion','match_key','onion|count','qty_base',1,'unit_group','count'))
    into many from generate_series(1, 81);
  perform public.sync_meal_shopping('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (select id from public.meals where title = 'Tacos later'), many);
  raise exception 'test 27 81 sync lines';
exception when others then
  if position('not available' in sqlerrm) = 0 then raise exception 'test 27 81 sync %', sqlerrm; end if;
end $$;
do $$
declare
  foreign_line uuid;
begin
  select line.id into foreign_line
  from public.recipe_ingredients line
  join public.recipes recipe on recipe.id = line.recipe_id
  where recipe.name = 'A private';
  perform public.sync_meal_shopping(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (select id from public.meals where title = 'Tacos later'),
    jsonb_build_array(jsonb_build_object('recipe_ingredient_id', foreign_line, 'name','Egg','match_key','egg|count','qty_base',1,'unit_group','count'))
  );
  raise exception 'test 27 foreign ingredient';
exception when others then
  if position('not available' in sqlerrm) = 0 then raise exception 'test 27 foreign %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.add_recipe_to_shopping('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(), null, null, 1, '[]'::jsonb);
  raise exception 'test 3 should fail';
exception when others then
  if position('access' in sqlerrm) = 0 and position('not available' in sqlerrm) = 0 then
    raise exception 'test 3 %', sqlerrm;
  end if;
end $$;
reset role;

-- Test 3 as C, and test 1 and 2 reads.
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
do $$
begin
  if (select count(*) from public.meals) <> 0 or (select count(*) from public.meal_shopping_needs) <> 0 then
    raise exception 'test 3 C can see H1';
  end if;
  perform public.save_planned_meal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"title":"X","meal_on":"2026-10-16","slot":"dinner","servings":1}'::jsonb, '[]'::jsonb, false);
  raise exception 'test 3 function';
exception when others then
  if position('access' in sqlerrm) = 0 then raise exception 'test 3 fn %', sqlerrm; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
do $$
declare
  before_count integer;
begin
  if (select count(*) from public.meals where visibility = 'shared') < 1 then
    raise exception 'test 1 V cannot read shared meals';
  end if;
  if (select count(*) from public.shopping_items where visibility = 'shared') < 1 then
    raise exception 'test 1 V cannot read shared items';
  end if;
  if (select count(*) from public.meal_shopping_needs where visibility = 'shared') < 1 then
    raise exception 'test 1 V cannot read shared links';
  end if;
  if (select count(*) from public.meals where visibility = 'private') <> 0 then
    raise exception 'test 1 V can read private meals';
  end if;
  select count(*) into before_count from public.meals;
  begin
    insert into public.meals (household_id, owner_id, visibility, title, meal_on, slot)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Nope', current_date, 'snack');
    raise exception 'test 1 insert';
  exception when insufficient_privilege or check_violation or others then
    if sqlstate not in ('42501') and position('row-level security' in sqlerrm) = 0 and position('access' in sqlerrm) = 0 then
      raise exception 'test 1 insert % %', sqlstate, sqlerrm;
    end if;
  end;
  if (select count(*) from public.meals) <> before_count then
    raise exception 'test 1 partial insert';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  if exists (select 1 from public.meals where title = 'Mine') then
    raise exception 'test 2 B sees A private meal';
  end if;
  if exists (select 1 from public.shopping_items where match_key = 'egg|count') then
    raise exception 'test 2 B sees A private item';
  end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  if exists (select 1 from public.recipes where name = 'B private') then
    raise exception 'test 2 A sees B private recipe';
  end if;
end $$;

-- Test 11. B leaves. B's private rows go. B's line on A's shared recipe stays.
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
delete from public.household_members
where user_id = '22222222-2222-4222-8222-222222222222'
  and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
begin
  if exists (select 1 from public.recipes where name = 'B private') then
    raise exception 'test 11 private recipe stayed';
  end if;
  if not exists (
    select 1 from public.recipe_ingredients line
    join public.recipes recipe on recipe.id = line.recipe_id
    where recipe.name = 'Shared tacos' and line.created_by = '22222222-2222-4222-8222-222222222222'
  ) then
    raise exception 'test 11 shared line was purged';
  end if;
  if not exists (select 1 from public.recipes where name = 'A private') then
    raise exception 'test 11 A private recipe was purged';
  end if;
end $$;

-- Test 4. anon
set local role anon;
do $$
begin
  begin
    perform 1 from public.meals;
    raise exception 'test 4 meals readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.meal_shopping_needs;
    raise exception 'test 4 links readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.shopping_items;
    raise exception 'test 4 items readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_planned_meal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}'::jsonb, '[]'::jsonb, false);
    raise exception 'test 4 function';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Starter recipe lands on the shared list. Test 22 catalog half.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.add_recipe_to_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'c7c7c7c7-c7c7-47c7-87c7-c7c7c7c7c7c7',
  null,
  (select id from public.catalog_recipes where name = 'Herb omelette'),
  1,
  (
    select jsonb_agg(jsonb_build_object(
      'catalog_ingredient_id', line.id, 'name', line.name, 'category', line.category,
      'match_key', 'omelette-' || line.sort_order::text || '|count',
      'amount_raw', line.quantity, 'qty_base', nullif(line.quantity, '')::numeric,
      'unit_group', 'count'
    ))
    from public.catalog_recipe_ingredients as line
    join public.catalog_recipes as recipe on recipe.id = line.catalog_recipe_id
    where recipe.name = 'Herb omelette' and line.quantity ~ '^[0-9]+$'
  )
) as starter \gset
do $$
begin
  if exists (
    select 1
    from public.shopping_items as item
    join public.shopping_lists as list on list.id = item.list_id
    where item.match_key like 'omelette-%' and list.visibility = 'private'
  ) then
    raise exception 'test 22 starter landed on a private list';
  end if;
  if not exists (
    select 1
    from public.shopping_items as item
    join public.shopping_lists as list on list.id = item.list_id
    where item.match_key like 'omelette-%' and list.visibility = 'shared'
  ) then
    raise exception 'test 22 starter missed the shared list';
  end if;
end $$;

-- Same lines through both entry points. Test 27 comparison uses a fresh recipe.
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"Compare","servings":1,"visibility":"shared","steps":[],"ingredients":[{"name":"Pea","quantity":"1","unit":"each","category":"produce"}]}'::jsonb
) as compare_recipe \gset
select public.save_planned_meal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jsonb_build_object('title','Compare meal','meal_on', current_date, 'slot','snack','servings',1,'visibility','shared','recipe_id', (:'compare_recipe'::jsonb->>'id')::uuid, 'client_request_id','d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4'),
  '[]'::jsonb,
  false
) as compare_meal \gset
select public.sync_meal_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (:'compare_meal'::jsonb->>'id')::uuid,
  (select jsonb_build_array(jsonb_build_object('recipe_ingredient_id', line.id, 'name','Pea','category','produce','match_key','pea|count','amount_raw','1','qty_base',1,'unit_group','count')) from public.recipe_ingredients line where line.recipe_id = (:'compare_recipe'::jsonb->>'id')::uuid)
) as via_sync \gset
select public.add_recipe_to_shopping(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5',
  (:'compare_recipe'::jsonb->>'id')::uuid,
  null,
  1,
  (select jsonb_build_array(jsonb_build_object('recipe_ingredient_id', line.id, 'name','Pea','category','produce','match_key','pea|count','amount_raw','1','qty_base',1,'unit_group','count')) from public.recipe_ingredients line where line.recipe_id = (:'compare_recipe'::jsonb->>'id')::uuid)
) as via_add \gset
do $$
declare
  sync_qty numeric;
  add_qty numeric;
begin
  select auto_qty into sync_qty from public.shopping_items where match_key = 'pea|count';
  if sync_qty is distinct from 2 then
    raise exception 'test 27 combined qty %', sync_qty;
  end if;
  select count(*) into add_qty from public.shopping_items where match_key = 'pea|count' and checked_at is null;
  if add_qty is distinct from 1 then
    raise exception 'test 27 item count %', add_qty;
  end if;
end $$;

-- Test 7. A shared link cannot use a private item, and a link cannot cross households.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare
  shared_meal uuid;
  private_item uuid;
begin
  select id into shared_meal from public.meals where title = 'Tacos later';
  select id into private_item from public.shopping_items where match_key = 'egg|count';
  begin
    insert into public.meal_shopping_needs (
      household_id, created_by, visibility, source_kind, meal_id, shopping_item_id, match_key, qty_base, unit_group
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'meal', shared_meal, private_item, 'egg|count', 1, 'count'
    );
    raise exception 'test 7 shared link accepted a private item';
  exception when others then
    if position('not available' in sqlerrm) = 0 and sqlstate <> '23503' then
      raise exception 'test 7 private item %', sqlerrm;
    end if;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
insert into public.shopping_lists (id, household_id, created_by, visibility, name, is_default)
values ('d9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', auth.uid(), 'shared', 'Groceries', true);
insert into public.shopping_items (id, household_id, owner_id, visibility, list_id, name, category, source, user_edited)
values (
  'e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', auth.uid(), 'shared',
  'd9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9', 'Far item', 'pantry', 'manual', true
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare
  shared_meal uuid;
begin
  select id into shared_meal from public.meals where title = 'Tacos later';
  begin
    insert into public.meal_shopping_needs (
      household_id, created_by, visibility, source_kind, meal_id, shopping_item_id, match_key, qty_base, unit_group
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'meal', shared_meal,
      'e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9', 'far|count', 1, 'count'
    );
    raise exception 'test 7 cross household link accepted';
  exception when others then
    if position('not available' in sqlerrm) = 0 and sqlstate <> '23503' then
      raise exception 'test 7 cross %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- Helper writes are members who can write, and only in their household.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
do $$
begin
  begin
    perform public.recompute_shopping_item_auto('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001');
    raise exception 'view-only recompute allowed';
  exception when others then
    if position('access' in sqlerrm) = 0 then
      raise exception 'view-only recompute %', sqlerrm;
    end if;
  end;
  begin
    perform public.keep_or_delete_shopping_item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001');
    raise exception 'view-only keep allowed';
  exception when others then
    if position('access' in sqlerrm) = 0 then
      raise exception 'view-only keep %', sqlerrm;
    end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
do $$
begin
  begin
    perform public.recompute_shopping_item_auto('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001');
    raise exception 'other household recompute allowed';
  exception when others then
    if position('access' in sqlerrm) = 0 then
      raise exception 'other household recompute %', sqlerrm;
    end if;
  end;
  begin
    perform public.keep_or_delete_shopping_item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001');
    raise exception 'other household keep allowed';
  exception when others then
    if position('access' in sqlerrm) = 0 then
      raise exception 'other household keep %', sqlerrm;
    end if;
  end;
end $$;
reset role;

rollback;
