#!/bin/bash
# Two concurrent first adds create one shared list. Both items land on that household's list.
set -euo pipefail
DB="${SLICE3_DB:-deanly_slice3}"
PSQL=(sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -q)
H1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

"${PSQL[@]}" -c "delete from public.meal_shopping_needs where household_id = '${H1}'; delete from public.shopping_items where household_id = '${H1}'; delete from public.meals where id in ('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'); delete from public.recipe_ingredients where recipe_id in (select id from public.recipes where name = 'First list bowl' and household_id = '${H1}'); delete from public.recipes where name = 'First list bowl' and household_id = '${H1}'; delete from public.shopping_lists where household_id = '${H1}';"
"${PSQL[@]}" -f "$(dirname "$0")/slice3-first-list.sql"

add_one() {
  local meal="$1"
  local ingredient="$2"
  local key="$3"
  local qty="$4"
  "${PSQL[@]}" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); select public.sync_meal_shopping('${H1}', '${meal}', (select jsonb_build_array(jsonb_build_object('recipe_ingredient_id', line.id, 'name', line.name, 'category', line.category, 'match_key', '${key}', 'amount_raw', '${qty}', 'qty_base', ${qty}, 'unit_group', 'count')) from public.recipe_ingredients line join public.recipes recipe on recipe.id = line.recipe_id where recipe.household_id = '${H1}' and recipe.name = 'First list bowl' and line.name = '${ingredient}')); commit;"
}

add_one "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1" "Onion" "onion|count" 2 &
pid1=$!
add_one "f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2" "Garlic" "garlic|count" 1 &
pid2=$!
wait "$pid1"
wait "$pid2"

"${PSQL[@]}" -c "do \$\$ declare lists integer; items integer; begin select count(*) into lists from public.shopping_lists where household_id = '${H1}' and visibility = 'shared' and is_default; select count(*) into items from public.shopping_items as item join public.shopping_lists as list on list.id = item.list_id and list.household_id = item.household_id where item.household_id = '${H1}' and item.match_key in ('onion|count', 'garlic|count'); if lists <> 1 or items <> 2 then raise exception 'first list lists % items %', lists, items; end if; if exists (select 1 from public.shopping_items as item join public.shopping_lists as list on list.id = item.list_id where item.household_id = '${H1}' and list.household_id <> item.household_id) then raise exception 'first list crossed households'; end if; end \$\$;"
echo "first list ok"
