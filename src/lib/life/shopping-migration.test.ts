import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir, userInfo } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const upgrade = join(root, "supabase/migrations/20261015200000_shopping_upgrade.sql")

const beforeUpgrade = `
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

create type public.visibility as enum ('shared', 'private');

create table public.households (
  id uuid primary key,
  name text not null
);

create table public.shopping_items (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'shared',
  name text not null check (char_length(btrim(name)) between 1 and 140),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  store text,
  need_soon boolean not null default false,
  constraint shopping_items_store_len check (store is null or char_length(btrim(store)) between 1 and 40)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.can_access_row(p_household_id uuid, p_visibility public.visibility, p_owner_id uuid)
returns boolean language sql stable as $$ select true $$;

create or replace function public.can_write_household_content(p_household_id uuid)
returns boolean language sql stable as $$ select true $$;

create or replace function public.protect_household_row()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id then
      raise exception 'Household cannot be reassigned.';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Owner cannot be reassigned.';
    end if;
    if new.visibility is distinct from old.visibility
       and old.owner_id is distinct from auth.uid() then
      raise exception 'Only the person who added this can change who sees it.';
    end if;
  end if;
  return new;
end;
$$;

create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute function public.set_updated_at();

create trigger shopping_items_protect
  before update on public.shopping_items
  for each row execute function public.protect_household_row();

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.households (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Home'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other');

insert into public.shopping_items (
  id, household_id, owner_id, visibility, name, store, need_soon, checked_at, created_at
) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'shared', 'Milk', 'Costco', true, null, '2026-01-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'shared', 'Bread', null, false, null, '2026-02-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'private', 'Soap', null, false, '2026-03-01T00:00:00Z', '2026-01-15T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'private', 'Vitamins', 'Pharmacy', false, null, '2026-01-20T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'shared', 'Rice', null, false, null, '2026-01-01T00:00:00Z');
`

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

type MigratedItem = {
  name: string
  store: string | null
  need_soon: boolean
  checked_at: string | null
  manual_amount_raw: string | null
  manual_unit_raw: string | null
  manual_qty: string | null
  manual_unit: string | null
  auto_qty: string | null
  auto_unit: string | null
  category: string
  source: string
  user_edited: boolean
  list_id: string
  list_name: string
  is_default: boolean
  list_visibility: string
  list_created_by: string
  owner_id: string
  household_id: string
  visibility: string
}

test("existing shopping items move into a default list with the manual fields filled", async () => {
  const sql = readFileSync(upgrade, "utf8")
  assert.match(sql, /manual_amount_raw = null/)
  assert.match(sql, /manual_unit_raw = null/)
  assert.match(sql, /manual_qty = null/)
  assert.match(sql, /manual_unit = null/)
  assert.match(sql, /Existing rows have no amount/)

  const dir = mkdtempSync(join(tmpdir(), "deanly-pg-"))
  const port = await freePort()
  const initdb = tool("initdb")
  const pgCtl = tool("pg_ctl")
  const psql = tool("psql")
  const base = ["-h", dir, "-p", String(port), "-v", "ON_ERROR_STOP=1"]
  try {
    execFileSync(initdb, ["-D", dir, "--username", userInfo().username, "--auth=trust", "--no-instructions"], { stdio: "pipe" })
    execFileSync(pgCtl, ["-D", dir, "-o", `-p ${port} -k ${dir}`, "-l", join(dir, "server.log"), "-w", "start"], { stdio: "pipe" })
    execFileSync(psql, [...base, "-d", "postgres", "-c", "create database shopping"], { stdio: "pipe" })
    const bootstrap = join(dir, "before.sql")
    writeFileSync(bootstrap, beforeUpgrade)
    execFileSync(psql, [...base, "-d", "shopping", "-f", bootstrap], { stdio: "pipe" })
    const before = execFileSync(
      psql,
      [...base, "-d", "shopping", "-t", "-A", "-c", "select count(*)::text || '|' || (to_regclass('public.shopping_lists') is null)::text from public.shopping_items"],
      { encoding: "utf8" },
    ).trim()
    assert.equal(before, "5|true")
    execFileSync(psql, [...base, "-d", "shopping", "-f", upgrade], { stdio: "pipe" })
    const raw = execFileSync(
      psql,
      [
        ...base,
        "-d",
        "shopping",
        "-t",
        "-A",
        "-c",
        `select coalesce(json_agg(row_to_json(t) order by t.name), '[]'::json)
         from (
           select item.name, item.store, item.need_soon, item.checked_at,
                  item.manual_amount_raw, item.manual_unit_raw, item.manual_qty, item.manual_unit,
                  item.auto_qty, item.auto_unit, item.category, item.source, item.user_edited,
                  item.list_id, list.name as list_name, list.is_default,
                  list.visibility as list_visibility, list.created_by as list_created_by,
                  item.owner_id, item.household_id, item.visibility
           from public.shopping_items item
           join public.shopping_lists list on list.id = item.list_id
         ) t`,
      ],
      { encoding: "utf8" },
    )
    const rows = JSON.parse(raw) as MigratedItem[]
    assert.equal(rows.length, 5)
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]))
    for (const row of rows) {
      assert.equal(row.list_name, "Groceries")
      assert.equal(row.is_default, true)
      assert.equal(row.list_visibility, row.visibility)
      assert.equal(row.category, "other")
      assert.equal(row.source, "manual")
      assert.equal(row.user_edited, false)
      assert.equal(row.manual_amount_raw, null)
      assert.equal(row.manual_unit_raw, null)
      assert.equal(row.manual_qty, null)
      assert.equal(row.manual_unit, null)
      assert.equal(row.auto_qty, null)
      assert.equal(row.auto_unit, null)
      assert.equal("manual_amount_raw" in row, true)
      assert.equal("manual_unit_raw" in row, true)
      assert.equal("manual_qty" in row, true)
      assert.equal("manual_unit" in row, true)
    }
    const milk = byName.Milk
    const bread = byName.Bread
    const soap = byName.Soap
    const vitamins = byName.Vitamins
    const rice = byName.Rice
    assert.ok(milk && bread && soap && vitamins && rice)
    assert.equal(milk.list_id, bread.list_id)
    assert.equal(milk.list_created_by, "11111111-1111-1111-1111-111111111111")
    assert.equal(milk.store, "Costco")
    assert.equal(milk.need_soon, true)
    assert.equal(milk.checked_at, null)
    assert.notEqual(soap.list_id, milk.list_id)
    assert.equal(soap.list_created_by, soap.owner_id)
    assert.ok(soap.checked_at)
    assert.notEqual(vitamins.list_id, soap.list_id)
    assert.equal(vitamins.list_created_by, vitamins.owner_id)
    assert.equal(vitamins.store, "Pharmacy")
    assert.notEqual(rice.list_id, milk.list_id)
    assert.equal(rice.household_id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    assert.equal(rice.list_created_by, rice.owner_id)
  } catch (error) {
    const log = join(dir, "server.log")
    const detail = error instanceof Error ? error.message : String(error)
    const server = existsSync(log) ? readFileSync(log, "utf8").slice(-2000) : ""
    throw new Error(`${detail}\n${server}`)
  } finally {
    spawnSync(pgCtl, ["-D", dir, "-w", "-m", "fast", "stop"], { stdio: "pipe" })
    rmSync(dir, { recursive: true, force: true })
  }
})
