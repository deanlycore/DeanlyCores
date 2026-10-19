#!/bin/bash
# Test 13. Two sessions add onion|count. One open item, two links, summed auto_qty.
set -euo pipefail
DB="${SLICE3_DB:-deanly_slice3}"
PSQL=(sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "delete from public.meal_shopping_needs where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; delete from public.shopping_items where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; delete from public.meals where id in ('c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1','c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'); delete from public.recipe_ingredients where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and recipe_id in (select id from public.recipes where name = 'Onion bowl'); delete from public.recipes where name = 'Onion bowl';"
"${PSQL[@]}" -f "$(dirname "$0")/slice3-concurrency.sql"

sync_one() {
  local meal="$1"
  local qty="$2"
  "${PSQL[@]}" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); select public.sync_meal_shopping('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${meal}', (select jsonb_build_array(jsonb_build_object('recipe_ingredient_id', line.id, 'name','Onion','category','produce','match_key','onion|count','amount_raw','${qty}','qty_base', ${qty}, 'unit_group','count')) from public.recipe_ingredients line join public.recipes recipe on recipe.id = line.recipe_id where recipe.name = 'Onion bowl')); commit;"
}

sync_one "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1" 2 &
pid1=$!
sync_one "c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2" 3 &
pid2=$!
wait "$pid1"
wait "$pid2"

"${PSQL[@]}" -c "do \$\$ declare items integer; links integer; qty numeric; begin select count(*) into items from public.shopping_items where match_key = 'onion|count' and checked_at is null; select count(*) into links from public.meal_shopping_needs where match_key = 'onion|count'; select auto_qty into qty from public.shopping_items where match_key = 'onion|count' and checked_at is null; if items <> 1 or links <> 2 or qty is distinct from 5 then raise exception 'test 13 items % links % qty %', items, links, qty; end if; end \$\$;"
echo "test 13 ok"
