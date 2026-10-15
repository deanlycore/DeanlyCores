import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  FAMILY_COLORS,
  FAMILY_COPY,
  HOUSEHOLD_PERMISSIONS,
  accountPermissionLabel,
  assigneeLabel,
  compareFamilyProfiles,
  familyDetail,
  formatBirthday,
  parseFamilyForm,
  visibleProfiles,
} from "./profile.ts"

const workspace = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const src = join(dirname(fileURLToPath(import.meta.url)), "../..")
const sql = readFileSync(join(workspace, "supabase/migrations/20261014214051_family_profiles.sql"), "utf8")
const linkSql = readFileSync(join(workspace, "supabase/migrations/20261014233000_family_member_link.sql"), "utf8")
const board = readFileSync(join(src, "components/family/family-board.tsx"), "utf8")
const more = readFileSync(join(src, "app/(app)/more/page.tsx"), "utf8")
const settings = readFileSync(join(src, "app/(app)/settings/page.tsx"), "utf8")
const familyPage = readFileSync(join(src, "app/(app)/life/family/page.tsx"), "utf8")
const familyPreview = readFileSync(join(src, "app/preview/life/family/page.tsx"), "utf8")
const inviteCard = readFileSync(join(src, "components/settings/invite-codes-card.tsx"), "utf8")
const nameSql = readFileSync(join(workspace, "supabase/migrations/20261015004500_household_name_default.sql"), "utf8")

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
  assert.match(board, /order-2 grid gap-2\.5/)
  assert.match(board, /bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]!/)
  assert.equal(/8\.5rem/.test(board), false)
  assert.match(board, /FAMILY_COPY\.you/)
  assert.equal(/LifeFab/.test(board), false)
  assert.match(board, /FAMILY_COPY\.removeBody/)
  assert.match(more, /href: "\/life\/family"/)
  assert.match(familyPage, /HouseholdPanel/)
  assert.match(familyPage, /beforeList/)
  assert.match(settings, /href="\/life\/family"/)
  assert.equal(/HouseholdNameForm|InviteCodesCard/.test(settings), false)
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

test("one list puts owners first and kids last, with Has login instead of a badge", () => {
  assert.equal(accountPermissionLabel("owner"), "Owner")
  assert.equal(accountPermissionLabel("adult"), "Adult")
  assert.equal(accountPermissionLabel("view_only"), "View-only")
  assert.equal(accountPermissionLabel(null), null)
  assert.equal(familyDetail({ role: null, userId: "owner", permission: "owner" }), "Owner · Has login")
  assert.equal(familyDetail({ role: "Partner", userId: "adult", permission: "adult" }), "Adult · Has login")
  assert.equal(familyDetail({ role: null, userId: "quinn", permission: "view_only" }), "View-only · Has login")
  assert.equal(familyDetail({ role: "Son", userId: null, permission: null }), "Son")
  assert.equal(FAMILY_COPY.you, "You")
  const ordered = [
    { name: "Riley", userId: null, permission: null },
    { name: "Sam", userId: "sam", permission: "adult" as const },
    { name: "Alex", userId: "alex", permission: "owner" as const },
    { name: "Quinn", userId: "quinn", permission: "view_only" as const },
  ].sort(compareFamilyProfiles)
  assert.deepEqual(ordered.map((row) => row.name), ["Alex", "Quinn", "Sam", "Riley"])
  assert.match(FAMILY_COPY.accessOwn, /Only another owner can change this/)
  assert.match(FAMILY_COPY.accessLastOwner, /A household needs at least one owner\./)
  assert.match(JSON.stringify(HOUSEHOLD_PERMISSIONS), /Full control of this household\./)
  assert.match(JSON.stringify(HOUSEHOLD_PERMISSIONS), /Can add and edit shared items and kids\./)
  assert.match(JSON.stringify(HOUSEHOLD_PERMISSIONS), /Can see shared items\. Can’t make changes\./)
})

test("household logins are linked onto Family without a broad security definer", () => {
  assert.match(linkSql, /add column user_id uuid references auth\.users/)
  assert.match(linkSql, /where user_id is not null/)
  assert.equal(/security definer/i.test(linkSql), false)
  assert.equal(/for delete/i.test(linkSql), false)
  assert.equal(/grant\s+[^;]*service_role/i.test(linkSql), false)
  assert.match(linkSql, /revoke all on table public\.family_profiles from anon/)
  assert.match(linkSql, /revoke all on table public\.household_members from anon/)
  assert.match(linkSql, /revoke all on table public\.profiles from anon/)
  assert.match(linkSql, /grant update \(role\) on table public\.household_members to authenticated/)
  assert.match(linkSql, /The last owner cannot be demoted\./)
  assert.match(linkSql, /A household login stays on Family\./)
  assert.match(linkSql, /Only the household owner can change permissions\./)
  assert.match(linkSql, /new\.household_id := active/)
  assert.match(linkSql, /members\.user_id = auth\.uid\(\)/)
  assert.match(linkSql, /limit 1/)

  const updateStart = linkSql.indexOf("create policy family_profiles_update")
  const updateEnd = linkSql.indexOf("create or replace function public.sync_family_profile_display_name")
  const updatePolicy = linkSql.slice(updateStart, updateEnd)
  assert.ok(updateStart > 0 && updateEnd > updateStart)
  assert.equal(/from public\.family_profiles/.test(updatePolicy), false)
  assert.match(updatePolicy, /households\.owner_id = auth\.uid\(\)/)
  assert.match(updatePolicy, /family_profiles\.user_id = auth\.uid\(\)/)

  const rolePolicy = linkSql.slice(linkSql.indexOf("create policy household_members_update_role"))
  assert.match(rolePolicy, /households\.owner_id = auth\.uid\(\)/)
  assert.match(board, /family-permission/)
  assert.match(board, /FAMILY_COPY\.permissionLabel/)
  assert.match(familyPage, /viewerId=\{family\.viewerId\}/)
  assert.match(familyPage, /viewerRole=\{family\.viewerRole\}/)
})

test("any owner can edit a household, and view only cannot write shared rows", () => {
  const rules = readFileSync(join(workspace, "supabase/migrations/20261015020100_household_role_rules.sql"), "utf8")
  assert.match(rules, /A household needs at least one owner\./)
  assert.match(rules, /You cannot change your own role\./)
  assert.match(rules, /public\.is_household_owner\(family_profiles\.household_id\)/)
  assert.match(rules, /public\.can_write_household_content\(household_id\)/)
  assert.match(rules, /visibility = 'private'/)
  assert.match(rules, /is distinct from 'view_only'/)
  assert.equal(/DeanFamily|Andrey|Arabella/.test(rules), false)
  assert.equal(/grant\s+[^;]*service_role/i.test(rules), false)
  assert.match(rules, /revoke all on table public\.family_profiles from anon/)
  const updateStart = rules.indexOf("create policy family_profiles_update")
  const updateEnd = rules.indexOf("drop policy if exists profiles_update_household_owner")
  const updatePolicy = rules.slice(updateStart, updateEnd)
  assert.ok(updateStart > 0 && updateEnd > updateStart)
  assert.equal(/from public\.family_profiles/.test(updatePolicy), false)
  assert.equal(/households\.owner_id/.test(updatePolicy), false)
  const rolePolicy = rules.slice(rules.indexOf("create policy household_members_update_role"), rules.indexOf("drop policy if exists household_members_delete_self_or_owner"))
  assert.equal(/households\.owner_id/.test(rolePolicy), false)
  assert.match(rolePolicy, /is_household_owner\(household_id\)/)
  assert.match(board, /HOUSEHOLD_PERMISSIONS/)
  assert.match(readFileSync(join(src, "lib/family/profile.ts"), "utf8"), /View-only/)
  assert.match(readFileSync(join(src, "lib/family/profile.ts"), "utf8"), /Can see shared items/)
})

test("private-row purge is trigger-only and not an RPC", () => {
  const purge = readFileSync(join(workspace, "supabase/migrations/20261015041000_purge_private_rows_trigger_only.sql"), "utf8")
  assert.match(purge, /function public\.protect_household_member_delete\(\)/)
  assert.match(purge, /security definer/)
  assert.match(purge, /set search_path to 'public'/)
  assert.match(purge, /visibility = ''private''/)
  assert.match(purge, /drop function public\.purge_private_household_rows\(uuid, uuid\)/)
  assert.match(purge, /revoke all on function public\.protect_household_member_delete\(\) from public, anon, authenticated, service_role/)
  assert.equal(/grant execute on function public\.purge_private_household_rows/i.test(purge), false)
  assert.equal(/grant execute on function public\.protect_household_member_delete/i.test(purge), false)
  assert.equal(/DeanFamily|Andrey|Arabella/.test(purge), false)
})

test("role changes lock owner rows and invite role comes from the code", () => {
  const locks = readFileSync(join(workspace, "supabase/migrations/20261015030200_household_access_locks.sql"), "utf8")
  assert.match(locks, /for update/)
  assert.match(locks, /A household needs at least one owner\./)
  assert.match(locks, /auth\.uid\(\) is distinct from old\.user_id/)
  assert.match(locks, /grant update \(name, color\) on table public\.family_profiles to authenticated/)
  assert.match(locks, /invite\.granted_role/)
  assert.match(locks, /join_household/)
  assert.equal(/p_role/.test(locks.slice(locks.indexOf("insert into public.household_members"))), false)
  assert.equal(/DeanFamily|Andrey|Arabella/.test(locks), false)
  assert.equal(/grant\s+[^;]*service_role/i.test(locks), false)
})

test("family and household copy is not pinned to one household", () => {
  assert.equal(/Andrey|Arabella|DeanFamily/.test(familyPreview), false)
  assert.equal(/DeanFamily/.test(inviteCard), false)
  assert.match(familyPreview, /My household/)
  assert.match(nameSql, /alter column name set default 'My household'/)
  assert.match(nameSql, /chosen := 'My household'/)
  assert.equal(/DeanFamily/.test(nameSql), false)
})
