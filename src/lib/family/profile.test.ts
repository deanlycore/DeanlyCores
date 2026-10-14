import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  FAMILY_COLORS,
  FAMILY_COPY,
  assigneeLabel,
  formatBirthday,
  parseFamilyForm,
  visibleProfiles,
} from "./profile.ts"

const workspace = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const src = join(dirname(fileURLToPath(import.meta.url)), "../..")
const sql = readFileSync(join(workspace, "supabase/migrations/20261014214051_family_profiles.sql"), "utf8")
const board = readFileSync(join(src, "components/family/family-board.tsx"), "utf8")
const more = readFileSync(join(src, "app/(app)/more/page.tsx"), "utf8")

test("birthday is month and day, with no age", () => {
  assert.equal(formatBirthday("1992-03-12"), "Mar 12")
  assert.equal(formatBirthday("2018-11-18"), "Nov 18")
  assert.equal(formatBirthday(null), null)
  assert.equal(formatBirthday("1992-02-31"), null)
  assert.equal(formatBirthday("Mar 12"), null)
})

test("archived profiles stay out of the list and read as Unassigned", () => {
  const profiles = [
    { id: "jordan", name: "Jordan", archivedAt: null },
    { id: "casey", name: "Casey", archivedAt: "2026-02-01T00:00:00.000Z" },
  ]
  assert.deepEqual(visibleProfiles(profiles).map((row) => row.id), ["jordan"])
  assert.equal(assigneeLabel(profiles, "jordan"), "Jordan")
  assert.equal(assigneeLabel(profiles, "casey"), "Unassigned")
  assert.equal(assigneeLabel(profiles, null), "Unassigned")
  assert.equal(assigneeLabel(profiles, "missing"), "Unassigned")
})

test("avatar colors are the six palette tones and never red", () => {
  assert.deepEqual(
    FAMILY_COLORS.map((color) => color.id),
    ["teal", "deep", "sand", "success", "warn", "ink"],
  )
  const serialized = JSON.stringify(FAMILY_COLORS)
  assert.equal(/red|danger|#a65|#c47|#ff/i.test(serialized), false)
  for (const color of FAMILY_COLORS) {
    assert.match(color.swatch, /^var\(--/)
  }
})

test("a name is required and blank role or birthday can be left empty", () => {
  const missing = parseFamilyForm({ name: "  ", role: "", birthday: "", color: "teal", notes: "" })
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.message, "Add a name.")
  const saved = parseFamilyForm({
    name: " Jordan ",
    role: "",
    birthday: "",
    color: "sand",
    notes: "",
  })
  assert.equal(saved.ok, true)
  if (saved.ok) {
    assert.equal(saved.value.name, "Jordan")
    assert.equal(saved.value.role, null)
    assert.equal(saved.value.birthday, null)
    assert.equal(saved.value.color, "sand")
  }
  const red = parseFamilyForm({ name: "Jordan", role: "", birthday: "", color: "red", notes: "" })
  assert.equal(red.ok, false)
})

test("family copy stays household-wide and the phone entry is More", () => {
  const copy = JSON.stringify(FAMILY_COPY)
  assert.equal(/just me/i.test(copy), false)
  assert.equal(FAMILY_COPY.emptyOwner, "Add your family.")
  assert.equal(FAMILY_COPY.emptyMember, "No family members yet.")
  assert.equal(FAMILY_COPY.removeBody, "Their chores and notes stay. Anything assigned to them becomes Unassigned.")
  assert.match(board, /PhoneFabClearance/)
  assert.equal(/LifeFab/.test(board), false)
  assert.match(board, /FAMILY_COPY\.removeBody/)
  assert.match(more, /href: "\/life\/family"/)
})

test("family_profiles migration locks reads to members and writes to the household owner", () => {
  assert.match(sql, /create table public\.family_profiles/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /households\.owner_id = auth\.uid\(\)/)
  assert.equal(/security definer/i.test(sql), false)
  assert.equal(/for delete/i.test(sql), false)
  assert.match(sql, /revoke all on table public\.family_profiles from public, anon, authenticated, service_role/)
  assert.match(sql, /grant select, insert, update on table public\.family_profiles to authenticated/)
  assert.match(sql, /revoke truncate on table public\.family_profiles from authenticated/)
  assert.equal(/grant\s+[^;]*service_role/i.test(sql), false)
  assert.match(sql, /new\.household_id := active/)
  assert.match(sql, /new\.household_id is distinct from old\.household_id/)
  assert.match(sql, /Household cannot be reassigned\./)
  assert.match(sql, /color in \('teal', 'deep', 'sand', 'success', 'warn', 'ink'\)/)

  const updatePolicy = sql.slice(sql.indexOf("create policy family_profiles_update"))
  assert.equal(/from public\.family_profiles/.test(updatePolicy), false)
  assert.match(updatePolicy, /with check \([\s\S]*households\.owner_id = auth\.uid\(\)/)

  const guard = sql.indexOf("have no owner membership")
  const notNull = sql.search(/alter column owner_id set not null/i)
  assert.ok(guard > 0 && guard < notNull)
  assert.match(sql, /Cannot require households\.owner_id: % household\(s\) have no owner membership\./)

  assert.match(sql, /create policy households_insert_self[\s\S]*for insert[\s\S]*with check \(owner_id = auth\.uid\(\)\)/)

  const assign = sql.slice(sql.indexOf("function public.assign_family_profile_household"))
  assert.match(assign, /members\.user_id = auth\.uid\(\)/)
  assert.match(assign, /limit 1/)
  assert.equal(/order by households\.created_at/.test(assign), false)
  assert.match(assign, /households\.id = active[\s\S]*households\.owner_id = auth\.uid\(\)/)
})
