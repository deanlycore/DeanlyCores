import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir, userInfo } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { toCatalogRecipes, type CatalogSourceFile } from "./catalog-seed.ts"
import type { CatalogRecipe } from "./catalog.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const migration = join(root, "supabase/migrations/20261019120000_recipe_catalog.sql")
const recipes = toCatalogRecipes(JSON.parse(readFileSync(join(root, "data/recipes.json"), "utf8")) as CatalogSourceFile)

function tool(name: string) {
  for (const path of [`/usr/lib/postgresql/16/bin/${name}`, `/usr/lib/postgresql/17/bin/${name}`, `/usr/bin/${name}`]) {
    if (existsSync(path)) return path
  }
  return name
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function quote(value: string) {
  if (value.includes("$rcp$")) throw new Error("Recipe text collided with the SQL quote.")
  return `$rcp$${value}$rcp$`
}

function rowSql(recipe: CatalogRecipe) {
  const tags = recipe.tags.length ? `array[${recipe.tags.map(quote).join(",")}]::text[]` : `'{}'::text[]`
  return `(${[
    quote(recipe.slug),
    quote(recipe.name),
    quote(recipe.cuisine),
    quote(recipe.meal_type),
    String(recipe.minutes),
    String(recipe.servings),
    `${quote(JSON.stringify(recipe.ingredients))}::jsonb`,
    `${quote(JSON.stringify(recipe.steps))}::jsonb`,
    String(recipe.kcal),
    String(recipe.protein),
    String(recipe.carbs),
    String(recipe.fat),
    tags,
    quote(recipe.image_path),
    quote(recipe.source),
    quote(recipe.license),
  ].join(", ")})`
}

function upsertSql(rows: CatalogRecipe[], nameOverride?: string) {
  const values = rows
    .map((recipe) => rowSql(nameOverride ? { ...recipe, name: nameOverride } : recipe))
    .join(",\n")
  return `
    insert into public.recipe_catalog (
      slug, name, cuisine, meal_type, minutes, servings, ingredients, steps,
      kcal, protein, carbs, fat, tags, image_path, source, license
    ) values
    ${values}
    on conflict (slug) do update set
      name = excluded.name,
      cuisine = excluded.cuisine,
      meal_type = excluded.meal_type,
      minutes = excluded.minutes,
      servings = excluded.servings,
      ingredients = excluded.ingredients,
      steps = excluded.steps,
      kcal = excluded.kcal,
      protein = excluded.protein,
      carbs = excluded.carbs,
      fat = excluded.fat,
      tags = excluded.tags,
      image_path = excluded.image_path,
      source = excluded.source,
      license = excluded.license;
  `
}

const bootstrap = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
on conflict do nothing;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '11111111-1111-1111-1111-111111111111'::uuid
$$;

do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;

create type public.visibility as enum ('shared', 'private');

create or replace function public.recipe_steps_within_limit(steps jsonb)
returns boolean language sql immutable as $$
  select case
    when jsonb_typeof(steps) is distinct from 'array' then false
    when jsonb_array_length(steps) > 30 then false
    else not exists (
      select 1 from jsonb_array_elements_text(steps) as step(value)
      where char_length(step.value) > 2000
    )
  end;
$$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  created_by uuid not null,
  visibility public.visibility not null default 'shared',
  name text not null,
  category text,
  servings integer not null,
  steps jsonb not null default '[]'::jsonb,
  notes text
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  household_id uuid not null,
  created_by uuid not null,
  visibility public.visibility not null default 'shared',
  name text not null,
  quantity text,
  unit text,
  category text,
  sort_order integer not null
);

create table public.household_members (
  household_id uuid not null,
  user_id uuid not null,
  role text not null
);

insert into public.household_members (household_id, user_id, role)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

create or replace function public.can_write_household_content(p_household_id uuid)
returns boolean language sql stable as $$ select true $$;

create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated;
grant usage on schema storage to anon, authenticated;
`

test("recipe catalog is read-only for authenticated users, hidden from anon, and the seed upserts once", async () => {
  const sql = readFileSync(migration, "utf8")
  assert.match(sql, /slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/)
  assert.match(sql, /revoke all on table public\.recipe_catalog from public, anon, authenticated/)
  assert.match(sql, /revoke truncate on table public\.recipe_catalog from public, anon, authenticated/)
  assert.match(sql, /grant select on table public\.recipe_catalog to authenticated/)
  assert.match(sql, /for select/)
  assert.doesNotMatch(sql, /for insert|for update|for delete/)
  assert.match(sql, /using gin \(search\)/)
  assert.match(sql, /gin_trgm_ops/)
  assert.match(sql, /recipe-catalog/)
  assert.match(sql, /image\/webp/)
  assert.match(sql, /1048576/)
  assert.doesNotMatch(sql, /image\/svg/)

  const dir = mkdtempSync(join(tmpdir(), "deanly-catalog-"))
  const port = await freePort()
  const initdb = tool("initdb")
  const pgCtl = tool("pg_ctl")
  const psql = tool("psql")
  const base = ["-h", dir, "-p", String(port), "-v", "ON_ERROR_STOP=1"]
  try {
    execFileSync(initdb, ["-D", dir, "--username", userInfo().username, "--auth=trust", "--no-instructions"], { stdio: "pipe" })
    execFileSync(pgCtl, ["-D", dir, "-o", `-p ${port} -k ${dir}`, "-l", join(dir, "server.log"), "-w", "start"], { stdio: "pipe" })
    execFileSync(psql, [...base, "-d", "postgres", "-c", "create database catalog"], { stdio: "pipe" })
    const before = join(dir, "before.sql")
    writeFileSync(before, bootstrap)
    execFileSync(psql, [...base, "-d", "catalog", "-f", before], { stdio: "pipe" })
    execFileSync(psql, [...base, "-d", "catalog", "-f", migration], { stdio: "pipe" })

    const anonGrants = execFileSync(
      psql,
      [...base, "-d", "catalog", "-t", "-A", "-c", "select count(*) from information_schema.table_privileges where grantee = 'anon' and table_schema = 'public' and table_name = 'recipe_catalog'"],
      { encoding: "utf8" },
    ).trim()
    assert.equal(anonGrants, "0")
    const authenticated = execFileSync(
      psql,
      [...base, "-d", "catalog", "-t", "-A", "-c", "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.table_privileges where grantee = 'authenticated' and table_schema = 'public' and table_name = 'recipe_catalog'"],
      { encoding: "utf8" },
    ).trim()
    assert.equal(authenticated, "SELECT")

    const first = join(dir, "seed.sql")
    writeFileSync(first, upsertSql(recipes))
    execFileSync(psql, [...base, "-d", "catalog", "-f", first], { stdio: "pipe" })
    execFileSync(psql, [...base, "-d", "catalog", "-f", first], { stdio: "pipe" })
    const count = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", "select count(*) from public.recipe_catalog"], { encoding: "utf8" }).trim()
    assert.equal(count, "50")

    const renamed = join(dir, "rename.sql")
    writeFileSync(renamed, upsertSql([recipes[0]!], "Renamed once"))
    execFileSync(psql, [...base, "-d", "catalog", "-f", renamed], { stdio: "pipe" })
    const snapshot = (slug: string) =>
      "select cast((select count(*) from public.recipe_catalog) as text) || '|' || (select name from public.recipe_catalog where slug = '" + slug + "')"
    const renamedCount = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", snapshot(recipes[0]!.slug)], { encoding: "utf8" }).trim()
    assert.equal(renamedCount, "50|Renamed once")
    execFileSync(psql, [...base, "-d", "catalog", "-f", first], { stdio: "pipe" })
    const restored = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", snapshot(recipes[0]!.slug)], { encoding: "utf8" }).trim()
    assert.equal(restored, `50|${recipes[0]!.name}`)

    const denied = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", `
      select cast((
        select count(*) from public.search_recipe_catalog('chiken', null, null) where name ilike '%chicken%'
      ) as text)
      || '|' || cast((
        select count(*) from public.search_recipe_catalog(null, 'Mexican', 'quick')
      ) as text)
      || '|' || cast((
        select count(*) from public.search_recipe_catalog(null, null, 'vegetarian') where not ('vegetarian' = any(tags))
      ) as text)
    `], { encoding: "utf8" }).trim()
    const [typoHits, quickMexican, vegetarianMisses] = denied.split("|")
    assert.ok(Number(typoHits) > 0)
    assert.ok(Number(quickMexican) > 0)
    assert.equal(vegetarianMisses, "0")

    execFileSync(psql, [...base, "-d", "catalog", "-c", `
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      grant execute on function public.can_write_household_content(uuid) to authenticated;
      grant select on public.household_members to authenticated;
      grant select, insert on public.recipes, public.recipe_ingredients to authenticated;
    `], { stdio: "pipe" })
    const copied = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", `
      set role authenticated;
      select public.copy_recipe_catalog('chicken-tinga-tacos')->>'id';
    `], { encoding: "utf8" }).trim()
    const copiedAgain = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", `
      set role authenticated;
      select public.copy_recipe_catalog('chicken-tinga-tacos')->>'id';
    `], { encoding: "utf8" }).trim()
    assert.equal(copied, copiedAgain)
    const householdCopies = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", "select count(*) from public.recipes where catalog_slug = 'chicken-tinga-tacos'"], { encoding: "utf8" }).trim()
    assert.equal(householdCopies, "1")

    const anonRead = spawnSync(psql, [...base, "-d", "catalog", "-c", "set role anon; select count(*) from public.recipe_catalog"], { encoding: "utf8" })
    assert.notEqual(anonRead.status, 0)
    assert.match(`${anonRead.stderr}`, /permission denied/i)
    const write = spawnSync(psql, [...base, "-d", "catalog", "-c", `
      set role authenticated;
      insert into public.recipe_catalog (slug, name, cuisine, meal_type, minutes, servings, ingredients, steps, kcal, protein, carbs, fat, tags, image_path, source, license)
      values ('not-allowed', 'No', 'Mexican', 'dinner', 10, 1, '[]', '[]', 1, 1, 1, 1, '{}', 'recipes/not-allowed.webp', 'x', 'x');
    `], { encoding: "utf8" })
    assert.notEqual(write.status, 0)
    assert.match(`${write.stderr}`, /permission denied/i)

    const bucket = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", `
      select cast("public" as text) || '|' || cast(file_size_limit as text) || '|' || cast(allowed_mime_types as text)
      from storage.buckets where id = 'recipe-catalog'
    `], { encoding: "utf8" }).trim()
    assert.equal(bucket, "true|1048576|{image/jpeg,image/webp}")
    const policies = execFileSync(psql, [...base, "-d", "catalog", "-t", "-A", "-c", `
      select string_agg(cmd, ',' order by cmd) from pg_policies where policyname like 'recipe_catalog_objects%'
    `], { encoding: "utf8" }).trim()
    assert.equal(policies, "SELECT")
  } finally {
    execFileSync(tool("pg_ctl"), ["-D", dir, "-w", "stop"], { stdio: "pipe" })
    rmSync(dir, { recursive: true, force: true })
  }
})
