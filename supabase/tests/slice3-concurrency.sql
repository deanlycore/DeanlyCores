-- Test 13. Two sessions sync onion|count onto one list. Run after migrations, then the shell driver.
\set ON_ERROR_STOP on

begin;
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.households (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'H1', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;
insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"Onion bowl","servings":2,"visibility":"shared","steps":[],"ingredients":[{"name":"Onion","quantity":"2","unit":"each","category":"produce"}]}'::jsonb
);
insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Groceries', true
where not exists (
  select 1 from public.shopping_lists
  where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and visibility = 'shared' and is_default
);
insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, servings, recipe_id)
select 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Bowl one', current_date, 'lunch', 2, id
from public.recipes where name = 'Onion bowl' and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
on conflict (id) do nothing;
insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, servings, recipe_id)
select 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Bowl two', current_date, 'dinner', 2, id
from public.recipes where name = 'Onion bowl' and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
on conflict (id) do nothing;
reset role;
commit;
