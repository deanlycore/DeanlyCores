# Schema proposal: Meals and Shopping

Research only, from `main` at `e8a19d0427071b90bed9ed69cac98d4821d6e505`. Slice 1 is the shopping upgrade. Do not apply these migrations to production from a design pass.

## SE required changes

These override earlier sections where they differ.

1. Insert and update on child and link rows require `can_access_row` on every parent. That covers `recipe_ingredients`, `meal_shopping_needs`, `shopping_items.list_id`, and `pantry_items.shopping_item_id`. For a Just me parent, the child’s creator (`created_by`, or `owner_id` on `shopping_items`) must equal the parent’s creator. The check lives in `protect_household_row`, which already guards household and visibility. A missing parent and a parent the caller cannot read raise the same error (`That list is not available.` or `That item is not available.`). Slice 1 enforces this for `list_id`.
2. Catalog and alias tables (`catalog_recipes`, `catalog_recipe_ingredients`, `catalog_substitutions`, `unit_aliases`, `ingredient_aliases`) grant `select` to `authenticated` only. No grant to `anon`.
3. Composite foreign keys are `on update no action` and `on delete cascade`. Updating a parent from Shared to Just me while a child still references the shared key is rejected. The list toggle stays on Shared. Muted copy sits under the toggle: “Some items on this list are shared. Make them Just me or remove them first.” Making an item Just me moves it onto that person’s Just me list so the shared key can clear.
4. `protect_household_member_delete` purges private rows in every new household table: `shopping_lists` and `pantry_items` in the shopping migration; `recipes`, `recipe_ingredients`, `substitutions`, and `meal_shopping_needs` in the migration that creates them; `recipe_favorites` by `user_id` and `household_id`. Tables that use `created_by` are not forced through the `owner_id` loop. Execute stays revoked from `public`, `anon`, `authenticated`, and `service_role`.
5. `ingredient_aliases.is_staple` is boolean, default false. Salt, pepper, oil, and water are staples and are excluded from missing counts. The household ingredients table, when it exists, has the same column. Staples are an exact canonical match, not a fuzzy one.
6. Before an alias lookup, code normalizes the name and keeps the typed text on the row. Strip a leading quantity and the prep words chopped, diced, minced, sliced, fresh, large, and small. Singularize plurals (`tomatoes` to `tomato`, `berries` to `berry`) except hummus, molasses, asparagus, couscous, swiss chard, and greens. No fuzzy match, so chicken broth does not match chicken.
7. Shopping categories are Produce, Meat and Seafood, Dairy and Eggs, Bakery, Pantry, Frozen, Beverages, Household, and Other (`produce`, `meat`, `dairy`, `bakery`, `pantry`, `frozen`, `beverages`, `household`, `other`).
8. Favorites stay in `recipe_favorites` with `user_id = auth.uid()`. Substitutions stay global-read-only plus an editable household copy. Editable saves match `updated_at`. Reuse and unused-at-home views are `security_invoker` and only read rows the caller can select. Design docs at `/workspace/deanly-design/` were not read; screens use the existing dark tokens.

Meeting notes were not available (Granola is not connected). The nine item categories below are a closed set proposed for the migration, not a list that already exists in the app.

## What exists today

### Routes and UI

| Surface | Path | Data |
| --- | --- | --- |
| Meals | `/life/meals` | `listMeals()` → `MealsBoard` |
| Shopping | `/life/shopping` | `listShopping()` → `ShoppingBoard` |
| Preview | `/preview/life/meals`, `/preview/life/shopping` | In-memory sample, not the database |
| Home | Dinner tonight, meals count, shopping checklist | Same `meals` and `shopping_items` rows |
| Phone Life pills and desktop sidebar | `/life/meals`, `/life/shopping` | Nav copy says meals and shopping start Shared |

There is one shopping list per household in practice: every row is a `shopping_items` row. There is no list table, no pantry, no recipes, and no link from a meal to an item.

### Server actions (`src/lib/actions/records.ts`)

All of these run as the signed-in user through `requireHousehold()`. The household id comes from that user’s membership, never from a constant.

- Meals: `createMeal`, `updateMeal`, `deleteMeal`, `setMealVisibility`
- Shopping: `createShoppingItem`, `updateShoppingItem`, `deleteShoppingItem`, `setShoppingVisibility`, `setShoppingChecked`

Meal fields written today: `title`, `meal_on`, `slot` (`breakfast` | `lunch` | `dinner` | `snack`), `notes`, `visibility`. Shopping fields: `name`, `visibility`, and when the columns exist `store` and `need_soon`. Checking an item sets `checked_at`; unchecking clears it.

Shared creates of a meal or a shopping item also write `activity_events` (`entity_type` `meal` or `shopping`) and a shared push. `activity_events.entity_type` is a closed check list. Do not add new entity types in the shopping upgrade.

New meals and new shopping items default to Shared (`defaultVisibilityFor`). A previous Just me choice does not flip the next one. The create dialog still shows Shared / Just me.

### Household scoping

`requireHousehold()` loads `household_members` for `auth.uid()` and uses that `household_id`. Reads also pass `.eq("household_id", ctx.householdId)`. RLS is the real boundary: a query that forgot the filter still cannot see another household.

A person has one membership row in the current app (`limit(1)`). Roles on that membership:

- `owner` and `adult` (older rows may still say `member`): can write
- `view_only`: can read Shared rows only. No inserts, updates, or deletes

### Visibility

`public.visibility` is `shared` | `private`. The UI says Shared and Just me.

`can_access_row(household_id, visibility, owner_id)` is true when the caller is a member of that household and either the row is shared, or the row is private and `owner_id = auth.uid()` and the caller is not view-only. Another owner does not see someone else’s Just me rows.

`protect_household_row` (ordinary trigger, not security definer) blocks changing `household_id` or `owner_id`. Only the creator can change `visibility`.

When a membership row is deleted, `protect_household_member_delete` deletes that person’s private rows in the listed tables and leaves shared rows. It is security definer, trigger-only, and execute is revoked from `public`, `anon`, `authenticated`, and `service_role`. New private tables have to be added to that function’s table list or their Just me rows will survive a member leaving.

### Current tables

`public.meals`

- `id`, `household_id`, `owner_id`, `visibility` default `shared`
- `title` (1–140), `meal_on` date, `slot` in `breakfast|lunch|dinner|snack`
- `notes` up to 2000, nullable
- `created_at`, `updated_at`
- Index `(household_id, meal_on, slot)`
- No servings, no recipe

`public.shopping_items`

- `id`, `household_id`, `owner_id`, `visibility` default `shared`
- `name` (1–140), `checked_at` timestamptz null = still on the list
- `created_at`, `updated_at`
- Later migration adds `store` (1–40 or null) and `need_soon` boolean default false
- Index `(household_id, created_at desc)`
- No list, quantity, unit, price, notes, category, or source

Policies on both tables, after the role migration:

- select: `can_access_row(household_id, visibility, owner_id)`
- insert: `can_write_household_content(household_id)` and `owner_id = auth.uid()`
- update: caller can access the row and can write; new row stays in the household and is shared or still owned by the caller
- delete: caller can access the row and can write
- grants: `select, insert, update, delete` to `authenticated`
- triggers: `set_updated_at`, `protect_household_row`

The shopping UI also hardcodes store choices Costco and Smith's in the form. Those names are not in the schema. New tables do not encode a store, a user, or a household.

Home and the boards read at most 80 rows. That limit stays an app concern.

## Team constraints

These override the first draft where they differ.

- Every household table has `household_id`, `created_by`, and `visibility` (`shared` or `private`, shown as Shared and Just me). Select uses `can_access_row(household_id, visibility, created_by)`. Insert, update, and delete also require `can_write_household_content(household_id)`, which is false for `view_only`.
- `meals` and `shopping_items` already store that creator as `owner_id`, and `can_access_row` plus `protect_household_row` already use it. Leave that column name on those two tables. Every new household table uses `created_by` and passes it into `can_access_row` the same way.
- Seed recipes live in a global read-only catalog. Authenticated users get `select` only. No insert, update, or delete grant. Editing a catalog recipe copies it into the household. The catalog is never updated.
- The recipe catalog, the substitution defaults, the unit alias table, and the ingredient alias table are the only tables without `household_id`. They are not tenant data. They have no write grant, so they are not a way around household RLS.
- Substitutions follow the recipe catalog: global read-only defaults, and a household copy that can be edited. The copy uses `household_id`, `created_by`, Shared / Just me, `can_access_row`, and no writes for `view_only`. Nothing writes back to the defaults.
- Favorites are rows in `recipe_favorites`, not a column on `recipes`. Each row is scoped with `user_id = auth.uid()`. One person starring a recipe does not star it for anyone else, and starring does not copy a catalog recipe.
- Editable rows use `updated_at` as the optimistic concurrency token. A save that still holds an older `updated_at` changes zero rows and the screen prompts to reload.
- Slice 5 adds columns for bulk-add review, ingredient reuse across meals, and pantry rows no planned meal uses. The reuse view and the unused-at-home view are built only from rows that viewer can select. Those columns are specified here and are not created in slice 1.
- The design docs live at `/workspace/deanly-design/` on another machine and were not read. Meals and Shopping screens are still assumed dark-first on the existing night tokens in `src/app/globals.css`. No new colors. Light mode uses the same token names.
- Sync runs as the caller: the app’s user session, or a SQL function marked `security invoker`. No `security definer` function for sync. No service role.
- The link table requires the same `household_id` on the meal and the item. The “For \<meal\>” line is a join the viewer can read, not a label stored on the shopping item. It appears only when `can_access_row` allows that meal.
- Totals add only rows the viewer can select. No stored sum that includes a Just me row the viewer cannot see, and no definer aggregate.
- Grants on household tables are `select`, `insert`, `update`, and `delete` only. Nothing else (`truncate`, `references`, `trigger`, or a new definer execute).
- Units belong to `mass`, `volume`, `count`, or `package`. Amounts merge only inside one group. The raw text the user typed is what we store. Name and unit matching is exact equality on an alias table. No fuzzy match, no `pg_trgm`, no `LIKE` pattern.
- Pantry is its own table. Checking a list item off does not write pantry. The check action only offers “mark at home”, and a separate action writes the pantry row if the person accepts.
- An auto line that no meal still needs is deleted, unless someone checked it off or edited it. Then it stays, with a note that does not name the meal. Track `source` (`manual` or `auto`) and `user_edited`. Manual quantity and auto quantity are separate. Removing a meal changes only the auto side.
- The implementation PR runs `npm test` on Node 22. This note is not that PR.

No AI columns, jobs, or providers. No household id or user id in seed data. Price, when present, is integer cents, nullable, from `0` through `100000000`. Currency stays on `user_preferences`.

A normal trigger (not security definer) on each new household table blocks changes to `household_id` and `created_by`. Only `created_by` can change `visibility`. That is the same rule as `protect_household_row`, written for the `created_by` column. `set_updated_at` still maintains `updated_at`.

Optimistic concurrency uses that `updated_at`. The client keeps the value it loaded. The update is `where id = $id and updated_at = $loaded`. The trigger then sets `updated_at` to `now()`. Zero rows means someone else saved first, or the row is gone. The action returns a conflict and the screen prompts to reload. It does not overwrite. The same predicate applies to a delete started from a loaded row. Global read-only catalogs are not saved by the client, so they are not in this check. No second version integer, and no security definer to compare versions.

When a membership row is deleted, extend the existing `protect_household_member_delete` table list so Just me rows in the new tables are removed. Do that by replacing the function in place. Do not grant execute on it. For new tables the delete predicate is `created_by`, not `owner_id`.

## Rules for household tables

- `household_id` references `households(id)` on delete cascade.
- `created_by` references `auth.users(id)` on delete cascade. Insert check includes `created_by = auth.uid()`.
- `visibility public.visibility not null`.
- Select policy: `can_access_row(household_id, visibility, created_by)`.
- Insert policy: `can_write_household_content(household_id)` and `created_by = auth.uid()`.
- Update policy: the caller can access the existing row and can write; the new row stays in a household they can write, and is shared or still `created_by = auth.uid()`.
- Delete policy: the caller can access the row and can write.
- Grant only `select`, `insert`, `update`, `delete` to `authenticated`.
- Child rows carry the same three columns. A normal trigger rejects a child whose `household_id` or `visibility` differs from its parent.

## Proposed tables

### 1. `shopping_lists`

More than one list per household.

| Column | Rule |
| --- | --- |
| `id` | uuid pk, `gen_random_uuid()` |
| `household_id` | not null, fk households, cascade |
| `created_by` | not null, fk users, cascade. The person who added the list |
| `visibility` | not null, default `shared` |
| `name` | not null, trimmed length 1–40 |
| `is_default` | not null, default false |
| `created_at`, `updated_at` | timestamptz, default `now()` |

Indexes:

- Shared names: unique `(household_id, lower(name))` where `visibility = 'shared'`
- Private names: unique `(household_id, created_by, lower(name))` where `visibility = 'private'`
- One shared default: unique `(household_id)` where `visibility = 'shared' and is_default`
- One private default: unique `(household_id, created_by)` where `visibility = 'private' and is_default`
- Lookup: `(household_id, created_at)`

A list name is whatever the household types. The backfill name `Groceries` is a product default word, not a household name.

### 2. `shopping_items` (alter, do not replace)

Keep `id`, `household_id`, `owner_id` (this table’s created-by column), `visibility`, `name`, `checked_at`, `store`, `need_soon`, timestamps. `checked_at` remains the completed flag: null means open, a timestamp means checked off. Do not add a second boolean.

Slice 1 stores one numeric `qty` and the unit text the person typed. That quantity is the person’s amount. A later sync slice keeps auto quantity on `meal_shopping_needs` and must not shrink `qty` when a meal is removed.

Add:

| Column | Rule |
| --- | --- |
| `list_id` | not null after backfill. Composite fk `(list_id, household_id, visibility)` → `shopping_lists (id, household_id, visibility)`, `on update no action`, `on delete cascade` |
| `qty` | numeric(8,2) null, or `> 0` and `<= 9999`. Null when they typed no amount. Existing rows stay null. Do not invent a quantity |
| `unit` | text null, trimmed length 1–24. Stored as typed (`g`, `kg`, `cup`). Merge only inside one unit group |
| `price_cents` | integer null, check null or `0 <= price_cents <= 100000000`. The line price, not qty times a unit price |
| `notes` | text null, or length `<= 500`. The person’s own note. Sync does not replace it |
| `system_note` | text null, or length `<= 200`. Set only when an auto line is kept after no meal needs it. Fixed sentence, no meal title |
| `category` | not null default `other`, one of the nine values below |
| `source` | not null default `manual`, check `source in ('manual', 'auto')` |
| `user_edited` | boolean not null default false. True after the person changes the name, qty, unit, notes, category, or price. Sync does not set it |

Categories, stored as text (same style as `slot`, so the list can change later without `ALTER TYPE`):

1. `produce` — Produce
2. `meat` — Meat and Seafood
3. `dairy` — Dairy and Eggs
4. `bakery` — Bakery
5. `pantry` — Pantry
6. `frozen` — Frozen
7. `beverages` — Beverages
8. `household` — Household
9. `other` — Other

Composite foreign key so an item cannot sit on a list from another household or another visibility:

- unique `(id, household_id, visibility)` on `shopping_lists`
- `shopping_items (list_id, household_id, visibility)` references that unique key

`owner_id` on the item stays the person who added it. On a shared list that can differ from the list’s `created_by`. On a private list, the visibility match plus `can_access_row` means only that person can insert.

Index `(list_id, checked_at, name)`.

Existing rows backfill as `source = 'manual'`, `user_edited = false`, `category = 'other'`, `qty` null, `unit` null, `system_note` null. They had no amount to preserve. `store` and `need_soon` stay so the home widget and older clients keep working. Switching a list to Just me while a child still references the shared key is rejected (`on update no action`). The toggle stays on Shared and the screen shows: “Some items on this list are shared. Make them Just me or remove them first.” Making an item Just me moves that item onto the person’s Just me list.

Checking an item off still only sets `checked_at`. The client then offers “mark at home”. Accepting that calls a different action, which inserts a pantry row. Dismissing it leaves pantry untouched. Unchecking clears `checked_at` and does not remove the pantry row.

### 3. `pantry_items`

What is already at home. Not list status, and not `checked_at`.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `household_id`, `created_by`, `visibility` | same household rules, default visibility `shared` |
| `name` | not null, trimmed length 1–140. Stored as typed |
| `qty` | numeric(8,2) null, or `> 0` and `<= 9999` |
| `unit` | text null, trimmed length 1–24. Stored as typed |
| `category` | not null default `other`, same nine values |
| `notes` | text null, or length `<= 500` |
| `shopping_item_id` | uuid null. Set when “mark at home” started from a list line. `on delete set null`. No cascade from the list line into pantry, and none the other way |
| `created_at`, `updated_at` | timestamptz |

Index `(household_id, lower(name))`. Sync may read pantry rows the caller can see, and only those, when it decides how much of an auto line is still needed. It does not insert, update, or delete pantry rows. “Mark at home” is the only writer that creates a pantry row from a checked line, and only after the person accepts the offer.

### 4. Global catalog and household copies

`catalog_recipes` and `catalog_recipe_ingredients` are global and read-only. The migration role inserts the starter rows. After that, `authenticated` has `select` and no other grant. `anon` has no grant. RLS is on, with one select policy for `authenticated` (`using (true)`). There is no insert, update, or delete policy. No `household_id`, no `created_by`, no `visibility`.

`catalog_recipes`: `id`, `title` (1–140), `servings` (1–50), `prep_minutes`, `cook_minutes` (each null or 0–1440), `difficulty` null or `easy|medium|hard`, `steps` jsonb (0–30 strings, each 1–400), `notes` null or `<= 2000`. No image. The starter set is generic cooking, not a real household’s meals.

`catalog_recipe_ingredients`: `id`, `catalog_recipe_id` on delete cascade, `name` (1–140), `amount_raw` (1–40), `unit_raw` null or 1–24, `category` one of the nine, `sort_order` 0–80. Unique `(catalog_recipe_id, sort_order)`.

`recipes` is the household copy, created only when someone edits a catalog recipe or writes their own.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `household_id`, `created_by`, `visibility` | default `shared` |
| `catalog_recipe_id` | uuid null, fk `catalog_recipes(id)` on delete set null. Set on the copy. Not unique: two people may each have a Just me copy |
| `title`, `servings`, `prep_minutes`, `cook_minutes`, `difficulty`, `steps`, `notes` | same checks as the catalog |
| `image_path` | text null, or length 1–500. Storage path only |
| `created_at`, `updated_at` | timestamptz. `updated_at` is the concurrency token |

Index `(household_id, catalog_recipe_id)` and `(household_id, updated_at desc)`.

Copy on edit, in the caller’s session:

1. Read the catalog row (select is allowed).
2. Insert one `recipes` row for `requireHousehold()`’s household, `created_by = auth.uid()`, visibility the person chose (default Shared), `catalog_recipe_id` set, fields copied.
3. Insert `recipe_ingredients` the same way.
4. Further edits update the household rows only. A second edit of the same catalog recipe by someone who can already read a household copy updates that copy instead of inserting another for the same `(household_id, catalog_recipe_id, visibility, created_by)` when the copy is Just me, or the same `(household_id, catalog_recipe_id)` when a Shared copy already exists.
5. Nothing writes back to `catalog_recipes`.

Favorites are not on `recipes` and not on the catalog. `recipe_favorites` is one row per person per recipe.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `user_id` | not null, fk `auth.users(id)` on delete cascade. Policies require `user_id = auth.uid()` on select, insert, update, and delete |
| `household_id` | not null, fk households, cascade. The caller must be a member. This is not a Shared / Just me row |
| `recipe_id` | uuid null, fk `recipes(id)` on delete cascade |
| `catalog_recipe_id` | uuid null, fk `catalog_recipes(id)` on delete cascade |
| `created_at`, `updated_at` | timestamptz. A change to the row still matches `updated_at` |

Exactly one of `recipe_id` and `catalog_recipe_id` is set. Unique `(user_id, recipe_id)` and `(user_id, catalog_recipe_id)` where that column is not null.

There is no `visibility` column. Another member, including an owner, cannot select or write these rows. `view_only` may star and unstar only their own rows, because this is not household content. Inserting a household `recipe_id` also requires `can_access_row` on that recipe, so a star cannot point at a Just me recipe the person cannot read. A catalog star does not copy the recipe. Grants are `select`, `insert`, `update`, and `delete` only. When a membership is removed, delete `recipe_favorites` for that `user_id` and `household_id` in the same trigger that already purges private rows.

### 4b. Substitutions

Same shape as recipes. Defaults are global and read-only. An edit copies one into the household.

`catalog_substitutions` has no `household_id`, no `created_by`, and no `visibility`. `authenticated` gets `select` only. RLS is on, with a select policy `using (true)` and no write policy.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `from_canonical` | text not null, trimmed length 1–140. The ingredient to replace. Stored lowercased |
| `to_canonical` | text not null, trimmed length 1–140. What can stand in. Stored lowercased |
| `unit_group` | text null, or `mass` \| `volume` \| `count` \| `package`. When set, the substitute is only offered inside that group |
| `note` | text null, length `<= 200` |

Check `from_canonical <> to_canonical`. Unique `(from_canonical, to_canonical)`. Starter rows are generic pairs, not a household’s list. Matching uses the ingredient alias table: exact canonical equality, no fuzzy match.

`substitutions` is the household copy.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `household_id`, `created_by`, `visibility` | default `shared`. Same policies and grants as other household tables |
| `catalog_substitution_id` | uuid null, fk `catalog_substitutions(id)` on delete set null |
| `from_canonical`, `to_canonical`, `unit_group`, `note` | same checks as the catalog |
| `created_at`, `updated_at` | timestamptz |

Unique `(household_id, catalog_substitution_id)` where the catalog id is not null and `visibility = 'shared'`. Unique `(household_id, created_by, catalog_substitution_id)` where the catalog id is not null and `visibility = 'private'`. A household may also insert its own row with a null catalog id.

Editing a default reads the catalog row and inserts a `substitutions` row for the caller’s household. Later edits touch only that copy. Nothing writes back to `catalog_substitutions`. Sync and the recipe screen read catalog defaults plus the household copies the viewer can select. A household copy hides the catalog row with the same `catalog_substitution_id` for that viewer. Just me copies do not hide a default from anyone else. Totals and suggestion lists count only those visible rows.

`recipe_ingredients` (household): `recipe_id` on delete cascade, plus `household_id`, `created_by`, `visibility` matching the recipe, `name`, `amount_raw`, `unit_raw`, `category`, `notes` null or `<= 200`, `sort_order`. Unique `(recipe_id, sort_order)`.

Images for household copies go in a private bucket `recipe-images` (`public = false`, 25 MB, same path shape as vault: `{household_id}/{shared|private}/{user_id}/{recipe_id}/{filename}`). Object policies follow the vault policies and use `can_write_household_content` for writes. No public bucket and no new security definer helper. Catalog rows have no image.

### 5. Planned meals

Keep `public.meals`. Do not rename it. Current rows are already planned meals: a date, a slot, and a title.

Add:

| Column | Rule |
| --- | --- |
| `servings` | integer not null default 1, check `1 <= servings <= 50`. Existing rows backfill to 1 |
| `recipe_id` | uuid null, fk household `recipes(id)` on delete set null |
| `catalog_recipe_id` | uuid null, fk `catalog_recipes(id)` on delete set null |

`title`, `meal_on`, `slot`, and `notes` stay. A meal can still be “Leftover” with no recipe. `slot` stays `breakfast|lunch|dinner|snack`. At most one of `recipe_id` and `catalog_recipe_id` is set.

Planning from the catalog stores `catalog_recipe_id` and does not copy. The first edit copies into `recipes`, points `recipe_id` at the copy, and clears `catalog_recipe_id`.

A normal trigger checks a household `recipe_id` is in the same household. A shared meal can only reference a shared household recipe. A Just me meal can reference the global catalog (everyone authenticated can read it) or a household recipe that same person can read. A shared meal cannot reference a Just me recipe.

### 6. Units and name aliases

`unit_aliases` and `ingredient_aliases` are global and read-only, same grant and RLS shape as the recipe catalog. The migration inserts the rows. No household column.

`unit_aliases`

| Column | Rule |
| --- | --- |
| `alias` | text primary key. Stored already trimmed and lowercased (`lb`, `lbs`, `pound`) |
| `canonical` | text not null. The unit we compare (`pound`, `cup`, `each`, `pack`) |
| `unit_group` | text not null, check in `mass`, `volume`, `count`, `package` |
| `to_base` | numeric not null, check `> 0`. Multiply a parsed amount to reach the group’s base unit. Used only to add numbers in memory |
| `base_label` | text not null. Label for that in-memory total (`g`, `ml`, `each`, `pack`). Never written back over a raw amount |

Lookup is `lower(btrim(typed_unit)) = alias`. If no row matches, the unit does not merge with anything. No closest-match and no prefix match.

`ingredient_aliases`

| Column | Rule |
| --- | --- |
| `alias` | text primary key, trimmed and lowercased |
| `canonical` | text not null, the name two lines must share to be the same item |
| `is_staple` | boolean not null default false. Salt, pepper, oil, and water are true. Exact canonical match only. Staples are left out of missing counts |

Lookup normalizes the typed name in code first: strip a leading quantity and the prep words chopped, diced, minced, sliced, fresh, large, and small, then singularize plurals (`tomatoes` to `tomato`, `berries` to `berry`) except hummus, molasses, asparagus, couscous, swiss chard, and greens. The row keeps the raw name. The alias match is exact on that normalized text. No fuzzy match, so chicken broth does not match chicken. `authenticated` has `select` only. `anon` has no grant.

Two lines may merge only when the canonical names are equal and both units resolve to the same `unit_group`. A mass line and a volume line stay two lines even if the names match. The stored raw amounts stay as typed. A screen total may add parsed amounts inside one group, in base units, and only from rows that select returned. That total is not saved onto the item.

Parsing accepts a plain number or a fraction (`1/2`, `1 1/2`). If the raw text does not parse, that line is shown as typed and is left out of the numeric total.

### 7. `meal_shopping_needs`

One row is one meal’s auto amount on one shopping item. This is the auto quantity. It is not copied into `manual_amount_raw`.

| Column | Rule |
| --- | --- |
| `id` | uuid pk |
| `household_id` | not null. Must equal the meal’s household and the item’s household |
| `created_by` | not null. The person who ran the sync that created the link (`auth.uid()`) |
| `visibility` | not null. Must equal the meal’s visibility and the item’s visibility |
| `meal_id` | not null, fk `meals(id)` on delete cascade |
| `shopping_item_id` | not null, fk `shopping_items(id)` on delete cascade |
| `recipe_ingredient_id` | uuid null, fk household `recipe_ingredients(id)` on delete cascade. Null when the line came from a catalog ingredient |
| `catalog_ingredient_id` | uuid null, fk `catalog_recipe_ingredients(id)` on delete cascade |
| `amount_raw` | text not null, length 1–40. This meal’s amount, as synced. Not the person’s manual amount |
| `unit_raw` | text null, length `<= 24` |
| `created_at`, `updated_at` | timestamptz |

Exactly one of `recipe_ingredient_id` and `catalog_ingredient_id` is set when the meal has a recipe. Unique `(meal_id, recipe_ingredient_id)` and `(meal_id, catalog_ingredient_id)` where that column is not null. Unique `(meal_id, shopping_item_id)`.

Same household on both sides, as composite foreign keys:

- unique `(id, household_id, visibility)` on `meals` and on `shopping_items`
- `meal_shopping_needs (meal_id, household_id, visibility)` references the meal key
- `meal_shopping_needs (shopping_item_id, household_id, visibility)` references the item key

A Just me meal can only link to a Just me item in that same household. A shared meal can only link to a shared item. Anyone who can read the item can read every link on it, because a meal they cannot read cannot point at it. That is what lets the caller decide “no meal still needs this” without a definer function.

Select policy, so the “For \<meal\>” line cannot leak:

```sql
can_access_row(household_id, visibility, created_by)
and exists (
  select 1 from public.meals m
  where m.id = meal_id
    and m.household_id = meal_shopping_needs.household_id
    and public.can_access_row(m.household_id, m.visibility, m.owner_id)
)
```

The shopping screen builds “For \<meal title\>” by joining links the viewer can select to meals the viewer can select. It does not read a meal name off `shopping_items`. Writes still require `can_write_household_content`. View-only members get no insert, update, or delete.

Deleting a meal deletes its links only. It does not cascade into `shopping_items`. The caller’s sync then applies the keep-or-delete rule below.

## Sync

Runs as the caller. Prefer the existing server-action client (`requireHousehold()`’s Supabase client). If a SQL function is added, it is `security invoker` (the default), `execute` is granted only to `authenticated`, and it is not `security definer`. It is not called with the service role. It sees only rows `can_access_row` already allows.

Input is one meal the caller can update. List choice:

- Shared meal → the household’s default shared list. If none exists, insert one named `Groceries`, shared, `created_by` the caller.
- Just me meal → that person’s default private list, same fallback.
- Stop if the list visibility and the meal visibility differ.

Needed lines come from the household recipe or the catalog recipe. Scale the ingredient’s raw amount by `meal.servings / recipe.servings` only when the raw amount parses. Keep a raw string for the scaled amount. Do not overwrite any manual raw text.

Subtract pantry only from rows the caller can read, and only when the canonical name matches and the unit groups match. Pantry is read-only here. If what they have at home covers the line, this meal keeps no link for it.

A meal with no recipe adds no auto lines. Its title does not become a shopping item.

In one transaction:

1. Load this meal’s links. The caller can read them, because visibility matches the meal.
2. For each needed line, update the existing link for that ingredient in place (`amount_raw` and `unit_raw` on the link only).
3. If there is no link, find an open item on the chosen list with the same canonical name and the same unit group. Completed items are not reused. Insert a link. Do not change `manual_amount_raw`, `manual_unit_raw`, `notes`, `price_cents`, `category`, `store`, `source`, or `user_edited` on a manual item.
4. If no such item exists, insert an item with `source = 'auto'`, `user_edited = false`, empty manual amount, the ingredient name and category, and the meal’s visibility, then insert the link. `on conflict` on the ingredient unique index updates the link, so a retry does not add a second line.
5. Delete links for this meal whose ingredient is no longer needed. That removes auto quantity only.
6. For each item that lost a link in this run, if the caller can still select any `meal_shopping_needs` row for it, leave the item. Those remaining links are another meal that still needs it.
7. If no link remains:
   - `source = 'manual'`, or `manual_amount_raw` is not null: leave the item. The manual amount is unchanged.
   - `checked_at` is not null, or `user_edited` is true: leave the item. Set `system_note` to `No longer needed for a meal. Left on the list.` Do not put a meal title in that note. Do not replace `notes`.
   - Otherwise the line is auto, unedited, and unchecked. Delete it.

Running sync twice updates the same links. It does not shrink `manual_amount_raw`. It does not delete a line another meal still links. It does not clear `checked_at`.

The amount on screen is the manual raw text, plus each visible link’s raw text. A numeric total is the sum of those parsed amounts when they share a unit group, and it counts only rows in the select result. It is not stored.

`deleteMeal` deletes the meal (links cascade) and then runs steps 6 and 7 for the items those links used.

## Migration order

Later files stay proposals after `20261015041000`. Slice 1 is the single file `20261015200000_shopping_upgrade.sql` (lists, item columns, pantry, unit aliases, ingredient aliases, parent checks, and the purge extension). It is not applied to production by the app change.

1. `20261015200000_shopping_upgrade.sql` — slice 1, as built. Includes `unit_aliases`, `ingredient_aliases`, and `pantry_items`. No backfill from `checked_at` into pantry.
2. `20261015181000_pantry_items.sql` — superseded by the slice 1 file. Do not add a second pantry migration.
3. `20261015182000_recipe_catalog.sql` — `catalog_recipes`, `catalog_recipe_ingredients`, `catalog_substitutions`, starter rows, select-only grants. Then household `recipes`, `recipe_ingredients`, `substitutions`, `recipe_favorites` (`user_id = auth.uid()`), the image bucket, and the purge list for the household tables and that user’s favorites.
4. `20261015183000_ingredient_aliases.sql` — `ingredient_aliases`, starter rows, select-only grants.
5. `20261015184000_meal_servings.sql` — `meals.servings`, `meals.recipe_id`, `meals.catalog_recipe_id`, backfill servings to 1.
6. `20261015185000_meal_shopping_needs.sql` — link table, composite household keys, select policy that joins the meal. No sync function in SQL unless it is `security invoker`.

Do not fold these into an edited copy of `20261001225000_home_v1_schema.sql`. That file already ran.

## Slice 1 — Shopping upgrade

SE approved this with the changes at the top. The migration is `supabase/migrations/20261015200000_shopping_upgrade.sql`. Do not apply it to production from the app deploy. The app still loads the previous shopping columns when the new tables are absent.

In scope, as built:

- `shopping_lists` with `household_id`, `created_by`, `visibility`, policies, and grants limited to `select`, `insert`, `update`, and `delete`.
- `shopping_items.list_id`, `qty`, `unit`, `price_cents`, `notes`, `system_note`, `category` (the nine labels above, including `beverages`), `source`, `user_edited`.
- Composite fk `on update no action` `on delete cascade`. Parent checks in `protect_household_row`: a missing list and a hidden list both raise `That list is not available.`
- Backfill: one shared default `Groceries` list per household that has a shared item (`created_by` is the oldest shared item’s `owner_id`); one private default list per `(household_id, owner_id)`; items stay `source = 'manual'`, `category = 'other'`, `qty` null. A household with no shopping rows gets no list until the first add.
- `pantry_items` for Have at home. Checking an item sets `checked_at` and only offers “Mark as at home?”. Accepting inserts a pantry row. Dismissing does not. Unchecking does not remove pantry.
- `unit_aliases` and `ingredient_aliases` (`is_staple` for salt, pepper, oil, water). `select` to `authenticated` only. No grant to `anon`. No write grant.
- `protect_household_member_delete` also purges private `shopping_lists` and `pantry_items` by `created_by`. `recipes`, `recipe_ingredients`, `substitutions`, `meal_shopping_needs`, and `recipe_favorites` are not named until the migration that creates them. Execute stays revoked.
- App: list switcher, Shared / Just me / All, the nine categories in collapsible groups, a collapsed Bought section, search, category filter, sort, Progress / Need to buy / Estimated total (priced unchecked rows the viewer can read). Quick add. Phone sheet and a 420px desktop side panel. Saves match `updated_at`.
- Name normalization and unit merge live in code. Tests cover `tomatoes` → `tomato`, the exception list, chicken broth not matching chicken, `500 g + 1 kg = 1.5 kg`, and cup not merging with g. The PR runs `npm test` and the build on Node 22.

Out of slice 1:

- Recipe catalog, household recipe copies, `recipe_favorites`, substitutions, images, meal servings, and `meal_shopping_needs`
- The slice 5 columns below
- Sync, and any `source = 'auto'` write
- New `activity_events` entity types
- Dropping `store` or `need_soon`

`source` and `user_edited` exist in slice 1 so later sync does not need another item migration. Auto quantity stays on the future link table and must not shrink `qty`.

## Slice 5 — later columns

Not created before slice 5. Listed now so earlier migrations do not paint into a corner. Each new household column follows the same RLS: the row’s `household_id`, creator, and visibility already decide who can read it. No new definer function. Grants stay `select`, `insert`, `update`, `delete`.

Bulk add review, on `meal_shopping_needs`:

| Column | Rule |
| --- | --- |
| `review_state` | text not null default `accepted`, check in `pending`, `accepted`, `skipped`. Rows that already exist backfill to `accepted`. Slice 5 sync inserts new auto links as `pending` |
| `reviewed_at` | timestamptz null. Set when the state leaves `pending` |

A pending link is the review queue, not a line on the open list. Accepting sets `accepted` and the line counts. Skipping sets `skipped` and removes only that auto amount. `manual_amount_raw` is unchanged either way. The review screen lists pending links the viewer can select, with “For \<meal\>” only when that meal is readable. A pending link is left out of totals.

Ingredient reuse across meals, on `meal_shopping_needs`:

| Column | Rule |
| --- | --- |
| `reuses_item` | boolean not null default false. True when this meal’s need points at an open list line another visible meal already uses, instead of inserting a second item |

The unique `(meal_id, shopping_item_id)` key is what makes two meals share one line. `reuses_item` records that the second meal joined that line on purpose. The reuse view joins only `meal_shopping_needs`, `meals`, and `shopping_items` rows the caller can select. Canonical names match through `ingredient_aliases`, and unit groups must match. A link the caller cannot read is not in the view, so it cannot be offered as a line to reuse. A Just me meal does not reuse a shared line, and a shared meal does not reuse a Just me line. Removing one meal drops that meal’s link and its auto amount only. If this is a SQL view, it is `security_invoker`. It is not `security definer`.

Items at home that no planned meal uses, on `pantry_items`:

| Column | Rule |
| --- | --- |
| `plan_use` | text not null default `unreviewed`, check in `unreviewed`, `keep`, `use_up` |

The unused-at-home view is not a stored flag. It is pantry rows the viewer can select whose canonical name is absent from the planned meals, household ingredients, and catalog ingredients that same viewer can select. A Just me meal or a Just me pantry row the viewer cannot read is left out of both sides of that comparison. `plan_use` is the household’s decision on a pantry row they can read. `unreviewed` is the default and does not mean the item is unused. If this is a SQL view, it is `security_invoker`. It is not `security definer`.

## Design

The design docs are at `/workspace/deanly-design/` on another machine. They were not read. Meals and Shopping are assumed dark-first on the night values already in `.dark` in `src/app/globals.css`: `--bg`, `--surface`, `--surface-muted`, `--sidebar`, `--ink`, `--ink-muted`, `--border`, `--brand`, `--brand-deep`, `--brand-soft`, `--on-brand-soft`, `--warm`, `--sand`, `--success`, `--warn`, `--danger`, `--focus`, `--brand-wash`, and `--shadow-soft-value`. Components use those tokens, not hex. Light mode is the same layout on the `:root` values of the same names. No new color, and no change to the app-wide appearance default. The night pairs already covered by `theme.test.ts` stay the contrast bar for body text and pills.

## Verification

The implementation PR, not this research note, runs `npm test` with Node 22 before it is opened. Node on this repo is pinned by `.nvmrc` (`22`) and `engines`. No service-role test, and no test that reads another household’s Just me rows to build a total.
