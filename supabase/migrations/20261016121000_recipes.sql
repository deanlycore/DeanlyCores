-- Household recipes, plus a global starter catalog.
-- The catalog is inserted once. Households copy a starter into their own rows.
-- Nothing here is written for a particular household or person.

create or replace function public.recipe_steps_within_limit(steps jsonb)
returns boolean
language sql
immutable
security invoker
set search_path to 'public'
as $$
  select case
    when jsonb_typeof(steps) is distinct from 'array' then false
    when jsonb_array_length(steps) > 30 then false
    else not exists (
      select 1
      from jsonb_array_elements_text(steps) as step(value)
      where char_length(step.value) > 2000
    )
  end;
$$;

revoke all on function public.recipe_steps_within_limit(jsonb) from public, anon;
grant execute on function public.recipe_steps_within_limit(jsonb) to authenticated;

create table public.catalog_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 140),
  category text,
  servings integer not null check (servings between 1 and 50),
  steps jsonb not null default '[]'::jsonb,
  notes text,
  sort_order integer not null,
  constraint catalog_recipes_category_len check (category is null or char_length(btrim(category)) between 1 and 40),
  constraint catalog_recipes_steps_ok check (public.recipe_steps_within_limit(steps)),
  constraint catalog_recipes_notes_len check (notes is null or char_length(notes) <= 2000)
);

create table public.catalog_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  catalog_recipe_id uuid not null references public.catalog_recipes (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  quantity text,
  unit text,
  category text,
  sort_order integer not null check (sort_order between 0 and 80),
  constraint catalog_recipe_ingredients_quantity_len check (quantity is null or char_length(btrim(quantity)) between 1 and 40),
  constraint catalog_recipe_ingredients_unit_len check (unit is null or char_length(btrim(unit)) between 1 and 24),
  constraint catalog_recipe_ingredients_category_ok check (
    category is null or category in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'other')
  ),
  unique (catalog_recipe_id, sort_order)
);

alter table public.catalog_recipes enable row level security;
alter table public.catalog_recipe_ingredients enable row level security;

revoke all privileges on table public.catalog_recipes from public, anon, authenticated;
revoke all privileges on table public.catalog_recipe_ingredients from public, anon, authenticated;
grant select on table public.catalog_recipes to authenticated;
grant select on table public.catalog_recipe_ingredients to authenticated;

create policy catalog_recipes_select
  on public.catalog_recipes
  for select to authenticated
  using (true);

create policy catalog_recipe_ingredients_select
  on public.catalog_recipe_ingredients
  for select to authenticated
  using (true);

with inserted as (
  insert into public.catalog_recipes (name, category, servings, steps, notes, sort_order)
  values
  ('Weeknight tacos', 'Dinner', 4, '["Warm the tortillas.","Cook the filling until browned.","Top with salsa and serve."]'::jsonb, 'Use beans when you want a meatless night.', 1),
  ('Tomato soup', 'Soup', 4, '["Simmer the tomatoes with the stock.","Blend until smooth.","Season and serve warm."]'::jsonb, 'A grilled cheese sits well beside it.', 2),
  ('Garlic pasta', 'Dinner', 4, '["Boil the pasta.","Cook the garlic in oil until fragrant.","Toss and finish with cheese."]'::jsonb, null, 3),
  ('Veggie fried rice', 'Dinner', 4, '["Scramble the eggs and set them aside.","Stir fry the vegetables.","Add the rice and eggs and toss."]'::jsonb, 'Day-old rice fries best.', 4),
  ('Sheet-pan chicken', 'Dinner', 4, '["Heat the oven.","Toss the chicken and vegetables.","Roast until the chicken is cooked through."]'::jsonb, null, 5),
  ('Lentil stew', 'Soup', 6, '["Rinse the lentils.","Simmer with the vegetables and stock.","Season and rest for a few minutes."]'::jsonb, 'Keeps well for a second night.', 6),
  ('Egg fried rice', 'Dinner', 2, '["Scramble the eggs.","Fry the rice.","Fold the eggs back in."]'::jsonb, null, 7),
  ('Banana oatmeal', 'Breakfast', 2, '["Simmer the oats with milk.","Slice the banana on top.","Finish with a spoon of yogurt."]'::jsonb, null, 8),
  ('Greek salad', 'Salad', 4, '["Chop the vegetables.","Toss with oil and lemon.","Top with feta."]'::jsonb, null, 9),
  ('Bean quesadillas', 'Dinner', 4, '["Mash the beans with salsa.","Fill the tortillas and add cheese.","Brown both sides in a pan."]'::jsonb, null, 10),
  ('Minestrone', 'Soup', 6, '["Soften the onion and carrot.","Add the tomatoes, beans, and pasta.","Simmer until the pasta is tender."]'::jsonb, null, 11),
  ('Baked potatoes', 'Dinner', 4, '["Scrub the potatoes.","Bake until tender.","Split and add the toppings."]'::jsonb, null, 12),
  ('Tuna sandwiches', 'Lunch', 2, '["Mix the tuna with yogurt.","Toast the bread.","Build the sandwiches."]'::jsonb, null, 13),
  ('Vegetable stir fry', 'Dinner', 4, '["Heat the pan.","Cook the vegetables until just tender.","Serve over rice."]'::jsonb, null, 14),
  ('Pancakes', 'Breakfast', 4, '["Mix the batter.","Cook until bubbles form.","Flip and finish."]'::jsonb, null, 15),
  ('Rice and beans', 'Dinner', 4, '["Simmer the beans.","Steam the rice.","Serve together with lime."]'::jsonb, 'A pot of both covers several meals.', 16),
  ('Chicken noodle soup', 'Soup', 6, '["Simmer the chicken in stock.","Add the noodles and carrots.","Shred the chicken and return it to the pot."]'::jsonb, null, 17),
  ('Caprese toast', 'Lunch', 2, '["Toast the bread.","Layer tomato, mozzarella, and basil.","Finish with oil."]'::jsonb, null, 18),
  ('Beef chili', 'Dinner', 6, '["Brown the beef.","Add the tomatoes and beans.","Simmer until thick."]'::jsonb, 'Better the next day.', 19),
  ('Yogurt parfaits', 'Breakfast', 2, '["Spoon yogurt into bowls.","Add fruit and oats.","Repeat the layers."]'::jsonb, null, 20),
  ('Roasted broccoli', 'Side', 4, '["Heat the oven.","Toss the broccoli with oil.","Roast until the edges brown."]'::jsonb, null, 21),
  ('Black bean burgers', 'Dinner', 4, '["Mash the beans with onion.","Form patties.","Brown them and serve on buns."]'::jsonb, null, 22),
  ('Tomato pasta', 'Dinner', 4, '["Boil the pasta.","Simmer the tomatoes with garlic.","Toss together."]'::jsonb, null, 23),
  ('Herb omelette', 'Breakfast', 1, '["Beat the eggs with the herbs.","Cook gently in butter.","Fold and serve."]'::jsonb, null, 24),
  ('Potato leek soup', 'Soup', 4, '["Soften the leeks.","Add potatoes and stock.","Blend until smooth."]'::jsonb, null, 25),
  ('Fish tacos', 'Dinner', 4, '["Season the fish.","Cook until it flakes.","Serve in warm tortillas."]'::jsonb, null, 26),
  ('Apple crumble', 'Dessert', 6, '["Slice the apples into a dish.","Rub the topping together.","Bake until bubbling."]'::jsonb, null, 27),
  ('Cucumber salad', 'Salad', 4, '["Slice the cucumbers.","Toss with yogurt and dill.","Chill before serving."]'::jsonb, null, 28),
  ('Peanut noodles', 'Dinner', 4, '["Boil the noodles.","Stir the sauce.","Toss and top with green onion."]'::jsonb, null, 29),
  ('Overnight oats', 'Breakfast', 2, '["Stir the oats and milk.","Chill overnight.","Top with berries."]'::jsonb, 'Mix the night before.', 30)
  returning id, name
)
insert into public.catalog_recipe_ingredients (catalog_recipe_id, name, quantity, unit, category, sort_order)
select inserted.id, lines.name, lines.quantity, lines.unit, lines.category, lines.sort_order
from inserted
join (values
  ('Weeknight tacos', 'Chicken thighs', '500', 'g', 'meat', 0),
  ('Weeknight tacos', 'Tortillas', '8', 'each', 'bakery', 1),
  ('Weeknight tacos', 'Onion', '1', 'each', 'produce', 2),
  ('Weeknight tacos', 'Salsa', '1', 'cup', 'pantry', 3),
  ('Weeknight tacos', 'Lime', '1', 'each', 'produce', 4),
  ('Tomato soup', 'Tomatoes', '800', 'g', 'produce', 0),
  ('Tomato soup', 'Vegetable stock', '1', 'l', 'pantry', 1),
  ('Tomato soup', 'Onion', '1', 'each', 'produce', 2),
  ('Tomato soup', 'Bread', '4', 'each', 'bakery', 3),
  ('Garlic pasta', 'Pasta', '400', 'g', 'pantry', 0),
  ('Garlic pasta', 'Garlic', '4', 'each', 'produce', 1),
  ('Garlic pasta', 'Parmesan', '40', 'g', 'dairy', 2),
  ('Garlic pasta', 'Parsley', '1', 'pack', 'produce', 3),
  ('Veggie fried rice', 'Rice', '3', 'cup', 'pantry', 0),
  ('Veggie fried rice', 'Eggs', '2', 'each', 'dairy', 1),
  ('Veggie fried rice', 'Carrots', '2', 'each', 'produce', 2),
  ('Veggie fried rice', 'Peas', '1', 'cup', 'frozen', 3),
  ('Veggie fried rice', 'Soy sauce', '2', 'ml', 'pantry', 4),
  ('Sheet-pan chicken', 'Chicken thighs', '600', 'g', 'meat', 0),
  ('Sheet-pan chicken', 'Potatoes', '500', 'g', 'produce', 1),
  ('Sheet-pan chicken', 'Broccoli', '300', 'g', 'produce', 2),
  ('Sheet-pan chicken', 'Olive oil', '2', 'ml', 'pantry', 3),
  ('Lentil stew', 'Lentils', '300', 'g', 'pantry', 0),
  ('Lentil stew', 'Carrots', '2', 'each', 'produce', 1),
  ('Lentil stew', 'Celery', '2', 'each', 'produce', 2),
  ('Lentil stew', 'Vegetable stock', '1', 'l', 'pantry', 3),
  ('Egg fried rice', 'Rice', '2', 'cup', 'pantry', 0),
  ('Egg fried rice', 'Eggs', '3', 'each', 'dairy', 1),
  ('Egg fried rice', 'Green onion', '2', 'each', 'produce', 2),
  ('Egg fried rice', 'Soy sauce', '1', 'ml', 'pantry', 3),
  ('Banana oatmeal', 'Oats', '1', 'cup', 'pantry', 0),
  ('Banana oatmeal', 'Milk', '250', 'ml', 'dairy', 1),
  ('Banana oatmeal', 'Banana', '1', 'each', 'produce', 2),
  ('Banana oatmeal', 'Yogurt', '100', 'g', 'dairy', 3),
  ('Greek salad', 'Cucumber', '1', 'each', 'produce', 0),
  ('Greek salad', 'Tomatoes', '3', 'each', 'produce', 1),
  ('Greek salad', 'Feta', '100', 'g', 'dairy', 2),
  ('Greek salad', 'Olives', '1', 'pack', 'pantry', 3),
  ('Bean quesadillas', 'Tortillas', '4', 'each', 'bakery', 0),
  ('Bean quesadillas', 'Black beans', '1', 'pack', 'pantry', 1),
  ('Bean quesadillas', 'Cheddar', '80', 'g', 'dairy', 2),
  ('Bean quesadillas', 'Salsa', '1', 'cup', 'pantry', 3),
  ('Minestrone', 'Onion', '1', 'each', 'produce', 0),
  ('Minestrone', 'Carrots', '2', 'each', 'produce', 1),
  ('Minestrone', 'Cannellini beans', '1', 'pack', 'pantry', 2),
  ('Minestrone', 'Pasta', '150', 'g', 'pantry', 3),
  ('Minestrone', 'Tomatoes', '400', 'g', 'produce', 4),
  ('Baked potatoes', 'Potatoes', '4', 'each', 'produce', 0),
  ('Baked potatoes', 'Cheddar', '80', 'g', 'dairy', 1),
  ('Baked potatoes', 'Sour cream', '100', 'g', 'dairy', 2),
  ('Baked potatoes', 'Green onion', '2', 'each', 'produce', 3),
  ('Tuna sandwiches', 'Tuna', '1', 'pack', 'pantry', 0),
  ('Tuna sandwiches', 'Bread', '4', 'each', 'bakery', 1),
  ('Tuna sandwiches', 'Yogurt', '2', 'ml', 'dairy', 2),
  ('Tuna sandwiches', 'Celery', '1', 'each', 'produce', 3),
  ('Vegetable stir fry', 'Broccoli', '300', 'g', 'produce', 0),
  ('Vegetable stir fry', 'Bell pepper', '2', 'each', 'produce', 1),
  ('Vegetable stir fry', 'Carrots', '2', 'each', 'produce', 2),
  ('Vegetable stir fry', 'Rice', '2', 'cup', 'pantry', 3),
  ('Vegetable stir fry', 'Soy sauce', '2', 'ml', 'pantry', 4),
  ('Pancakes', 'Flour', '200', 'g', 'pantry', 0),
  ('Pancakes', 'Milk', '250', 'ml', 'dairy', 1),
  ('Pancakes', 'Eggs', '2', 'each', 'dairy', 2),
  ('Pancakes', 'Butter', '30', 'g', 'dairy', 3),
  ('Rice and beans', 'Rice', '2', 'cup', 'pantry', 0),
  ('Rice and beans', 'Black beans', '2', 'pack', 'pantry', 1),
  ('Rice and beans', 'Onion', '1', 'each', 'produce', 2),
  ('Rice and beans', 'Lime', '1', 'each', 'produce', 3),
  ('Chicken noodle soup', 'Chicken thighs', '400', 'g', 'meat', 0),
  ('Chicken noodle soup', 'Noodles', '200', 'g', 'pantry', 1),
  ('Chicken noodle soup', 'Carrots', '2', 'each', 'produce', 2),
  ('Chicken noodle soup', 'Chicken stock', '1', 'l', 'pantry', 3),
  ('Caprese toast', 'Bread', '2', 'each', 'bakery', 0),
  ('Caprese toast', 'Tomatoes', '2', 'each', 'produce', 1),
  ('Caprese toast', 'Mozzarella', '100', 'g', 'dairy', 2),
  ('Caprese toast', 'Basil', '1', 'pack', 'produce', 3),
  ('Beef chili', 'Ground beef', '500', 'g', 'meat', 0),
  ('Beef chili', 'Kidney beans', '1', 'pack', 'pantry', 1),
  ('Beef chili', 'Tomatoes', '400', 'g', 'produce', 2),
  ('Beef chili', 'Onion', '1', 'each', 'produce', 3),
  ('Beef chili', 'Chili powder', '1', 'pack', 'pantry', 4),
  ('Yogurt parfaits', 'Yogurt', '300', 'g', 'dairy', 0),
  ('Yogurt parfaits', 'Berries', '200', 'g', 'produce', 1),
  ('Yogurt parfaits', 'Oats', '1', 'cup', 'pantry', 2),
  ('Yogurt parfaits', 'Honey', '1', 'ml', 'pantry', 3),
  ('Roasted broccoli', 'Broccoli', '500', 'g', 'produce', 0),
  ('Roasted broccoli', 'Olive oil', '1', 'ml', 'pantry', 1),
  ('Roasted broccoli', 'Lemon', '1', 'each', 'produce', 2),
  ('Roasted broccoli', 'Garlic', '2', 'each', 'produce', 3),
  ('Black bean burgers', 'Black beans', '2', 'pack', 'pantry', 0),
  ('Black bean burgers', 'Onion', '1', 'each', 'produce', 1),
  ('Black bean burgers', 'Breadcrumbs', '50', 'g', 'pantry', 2),
  ('Black bean burgers', 'Buns', '4', 'each', 'bakery', 3),
  ('Tomato pasta', 'Pasta', '400', 'g', 'pantry', 0),
  ('Tomato pasta', 'Tomatoes', '400', 'g', 'produce', 1),
  ('Tomato pasta', 'Garlic', '3', 'each', 'produce', 2),
  ('Tomato pasta', 'Basil', '1', 'pack', 'produce', 3),
  ('Herb omelette', 'Eggs', '3', 'each', 'dairy', 0),
  ('Herb omelette', 'Chives', '1', 'pack', 'produce', 1),
  ('Herb omelette', 'Butter', '10', 'g', 'dairy', 2),
  ('Herb omelette', 'Cheddar', '30', 'g', 'dairy', 3),
  ('Potato leek soup', 'Leeks', '2', 'each', 'produce', 0),
  ('Potato leek soup', 'Potatoes', '400', 'g', 'produce', 1),
  ('Potato leek soup', 'Vegetable stock', '1', 'l', 'pantry', 2),
  ('Potato leek soup', 'Cream', '100', 'ml', 'dairy', 3),
  ('Fish tacos', 'White fish', '400', 'g', 'meat', 0),
  ('Fish tacos', 'Tortillas', '8', 'each', 'bakery', 1),
  ('Fish tacos', 'Cabbage', '200', 'g', 'produce', 2),
  ('Fish tacos', 'Lime', '1', 'each', 'produce', 3),
  ('Fish tacos', 'Yogurt', '80', 'g', 'dairy', 4),
  ('Apple crumble', 'Apples', '6', 'each', 'produce', 0),
  ('Apple crumble', 'Flour', '100', 'g', 'pantry', 1),
  ('Apple crumble', 'Butter', '80', 'g', 'dairy', 2),
  ('Apple crumble', 'Oats', '1', 'cup', 'pantry', 3),
  ('Cucumber salad', 'Cucumber', '2', 'each', 'produce', 0),
  ('Cucumber salad', 'Yogurt', '150', 'g', 'dairy', 1),
  ('Cucumber salad', 'Dill', '1', 'pack', 'produce', 2),
  ('Cucumber salad', 'Lemon', '1', 'each', 'produce', 3),
  ('Peanut noodles', 'Noodles', '300', 'g', 'pantry', 0),
  ('Peanut noodles', 'Peanut butter', '80', 'g', 'pantry', 1),
  ('Peanut noodles', 'Soy sauce', '2', 'ml', 'pantry', 2),
  ('Peanut noodles', 'Green onion', '2', 'each', 'produce', 3),
  ('Peanut noodles', 'Lime', '1', 'each', 'produce', 4),
  ('Overnight oats', 'Oats', '1', 'cup', 'pantry', 0),
  ('Overnight oats', 'Milk', '250', 'ml', 'dairy', 1),
  ('Overnight oats', 'Yogurt', '100', 'g', 'dairy', 2),
  ('Overnight oats', 'Berries', '150', 'g', 'produce', 3)
) as lines(recipe, name, quantity, unit, category, sort_order)
  on lines.recipe = inserted.name;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  catalog_recipe_id uuid references public.catalog_recipes (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  category text,
  servings integer not null check (servings between 1 and 50),
  steps jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_category_len check (category is null or char_length(btrim(category)) between 1 and 40),
  constraint recipes_steps_ok check (public.recipe_steps_within_limit(steps)),
  constraint recipes_notes_len check (notes is null or char_length(notes) <= 2000)
);

create index recipes_household_idx
  on public.recipes (household_id, updated_at desc);

create index recipes_catalog_idx
  on public.recipes (household_id, catalog_recipe_id);

create unique index recipes_visibility_key
  on public.recipes (id, household_id, visibility);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 140),
  quantity text,
  unit text,
  category text,
  sort_order integer not null check (sort_order between 0 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredients_quantity_len check (quantity is null or char_length(btrim(quantity)) between 1 and 40),
  constraint recipe_ingredients_unit_len check (unit is null or char_length(btrim(unit)) between 1 and 24),
  constraint recipe_ingredients_category_ok check (
    category is null or category in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'other')
  ),
  unique (recipe_id, sort_order)
);

alter table public.recipe_ingredients
  add constraint recipe_ingredients_parent_fk
  foreign key (recipe_id, household_id, visibility)
  references public.recipes (id, household_id, visibility)
  on update no action
  on delete cascade
  deferrable initially deferred;

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

  if tg_table_name = 'recipe_ingredients' then
    select recipe.household_id, recipe.visibility, recipe.created_by
      into parent_household, parent_visibility, parent_creator
    from public.recipes as recipe
    where recipe.id = nullif(new_row->>'recipe_id', '')::uuid;
    parent_found := found;
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
  'Blocks household and creator reassignment. Child rows must read their parent. Missing and hidden parents raise the same error.';

do $$
declare
  t text;
begin
  foreach t in array array['recipes', 'recipe_ingredients']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all privileges on table public.%I from anon', t);
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

  foreach t in array array['shopping_lists', 'pantry_items', 'recipe_ingredients', 'recipes']
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

-- One transaction: recipe row, visibility, and ingredients.
-- The parent key is checked at commit, so a visibility change can delete and rewrite ingredients.
create or replace function public.save_household_recipe(p_recipe jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
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
begin
  if v_user is null then
    raise exception 'You don’t have access to change that.';
  end if;

  select hm.household_id
    into v_household
  from public.household_members hm
  where hm.user_id = v_user
  limit 1;

  if v_household is null or not public.can_write_household_content(v_household) then
    raise exception 'You don’t have access to change that.';
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

  if v_id is null then
    v_catalog := nullif(p_recipe->>'catalog_recipe_id', '')::uuid;
    insert into public.recipes (
      household_id, created_by, visibility, catalog_recipe_id, name, category, servings, steps, notes
    ) values (
      v_household, v_user, v_visibility, v_catalog, v_name, v_category, v_servings, v_steps, v_notes
    )
    returning id into v_id;
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
      and household_id = v_household
      and updated_at = v_stamp;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
  end if;

  delete from public.recipe_ingredients
  where recipe_id = v_id
    and household_id = v_household;

  insert into public.recipe_ingredients (
    recipe_id, household_id, created_by, visibility, name, quantity, unit, category, sort_order
  )
  select
    v_id,
    v_household,
    v_user,
    v_visibility,
    btrim(ingredient.value->>'name'),
    nullif(btrim(coalesce(ingredient.value->>'quantity', '')), ''),
    nullif(btrim(coalesce(ingredient.value->>'unit', '')), ''),
    nullif(btrim(coalesce(ingredient.value->>'category', '')), ''),
    (ingredient.ordinality - 1)::integer
  from jsonb_array_elements(coalesce(p_recipe->'ingredients', '[]'::jsonb)) with ordinality as ingredient(value, ordinality)
  where btrim(coalesce(ingredient.value->>'name', '')) <> '';

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.save_household_recipe(jsonb) from public, anon;
grant execute on function public.save_household_recipe(jsonb) to authenticated;
