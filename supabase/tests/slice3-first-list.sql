-- Two first adds share one Groceries list. No list exists for H1 before the race.
\set ON_ERROR_STOP on

begin;
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'c@example.com')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.households (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'H1', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;
insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner')
on conflict do nothing;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
insert into public.households (id, name, owner_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'H2', '44444444-4444-4444-8444-444444444444')
on conflict (id) do nothing;
insert into public.household_members (household_id, user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'owner')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
insert into public.shopping_lists (household_id, created_by, visibility, name, is_default)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', auth.uid(), 'shared', 'Groceries', true
where not exists (
  select 1 from public.shopping_lists
  where household_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and visibility = 'shared' and is_default
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_household_recipe(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"name":"First list bowl","servings":2,"visibility":"shared","steps":[],"ingredients":[{"name":"Onion","quantity":"2","unit":"each","category":"produce"},{"name":"Garlic","quantity":"1","unit":"each","category":"produce"}]}'::jsonb
);
insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, servings, recipe_id)
select 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Bowl onion', current_date, 'lunch', 2, id
from public.recipes where name = 'First list bowl' and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
on conflict (id) do nothing;
insert into public.meals (id, household_id, owner_id, visibility, title, meal_on, slot, servings, recipe_id)
select 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'shared', 'Bowl garlic', current_date, 'dinner', 2, id
from public.recipes where name = 'First list bowl' and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
on conflict (id) do nothing;
reset role;
commit;
