import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  ALREADY_IN_HOME_MESSAGE,
  DEFAULT_HOUSEHOLD_NAME,
  INVALID_CODE_MESSAGE,
  calmAccountError,
  calmInviteError,
  expiryFromChoice,
  inviteStatus,
  isActiveInvite,
  normalizeInviteCode,
  parseMaxUses,
  toActiveInvite,
  validInviteCodeShape,
  type InviteCodeRecord,
} from "./invite.ts"

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20261002030918_household_invite_codes.sql"),
  "utf8",
)

const now = new Date("2026-10-02T12:00:00.000Z")

function row(overrides: Partial<InviteCodeRecord> = {}): InviteCodeRecord {
  return {
    id: "code-1",
    code: "DEAN-7K2M4P9Q",
    created_at: "2026-10-01T16:00:00.000Z",
    expires_at: null,
    max_uses: 2,
    uses: 0,
    revoked_at: null,
    purpose: "create_household",
    ...overrides,
  }
}

test("codes normalize by dropping spaces and uppercasing", () => {
  assert.equal(normalizeInviteCode(" dean-7k2m 4p9q "), "DEAN-7K2M4P9Q")
  assert.equal(validInviteCodeShape("dean-7k2m4p9q"), true)
  assert.equal(validInviteCodeShape("DEAN-7K2M"), false)
  assert.equal(validInviteCodeShape("JOIN-7K2M4P9Q"), false)
  assert.equal(validInviteCodeShape("DEAN-7K2M4P9O"), false)
})

test("active codes exclude revoked, expired, used-up, and other purposes", () => {
  assert.equal(isActiveInvite(row(), now), true)
  assert.equal(isActiveInvite(row({ revoked_at: "2026-10-02T00:00:00.000Z" }), now), false)
  assert.equal(isActiveInvite(row({ expires_at: "2026-10-02T12:00:00.000Z" }), now), false)
  assert.equal(isActiveInvite(row({ expires_at: "2026-10-03T00:00:00.000Z" }), now), true)
  assert.equal(isActiveInvite(row({ uses: 2, max_uses: 2 }), now), false)
  assert.equal(isActiveInvite(row({ purpose: "join_household" }), now), false)
  assert.equal(toActiveInvite(row({ uses: 2 }), now), null)
  assert.equal(toActiveInvite(row(), now)?.code, "DEAN-7K2M4P9Q")
})

test("invite status copy matches the settings card", () => {
  assert.equal(inviteStatus({ maxUses: 2, uses: 0, expiresAt: null }, "UTC"), "Uses left 2 · Never")
  assert.equal(
    inviteStatus({ maxUses: 1, uses: 0, expiresAt: "2026-10-09T12:00:00.000Z" }, "UTC"),
    "Uses left 1 · Oct 9",
  )
  assert.equal(DEFAULT_HOUSEHOLD_NAME, "My household")
})

test("create-code choices default to one use and seven days", () => {
  assert.equal(parseMaxUses(""), 1)
  assert.equal(parseMaxUses("1"), 1)
  assert.equal(parseMaxUses("0"), null)
  assert.equal(parseMaxUses("21"), null)
  assert.equal(expiryFromChoice("never", now), null)
  assert.equal(expiryFromChoice("30", now), undefined)
  assert.equal(expiryFromChoice("7", now), "2026-10-09T12:00:00.000Z")
})

test("redeem errors stay calm and do not describe DeanFamily", () => {
  assert.equal(calmInviteError("That code isn’t valid anymore. Ask for a new one."), INVALID_CODE_MESSAGE)
  assert.equal(calmInviteError("code expired"), INVALID_CODE_MESSAGE)
  assert.equal(calmInviteError("A create-home code is required."), INVALID_CODE_MESSAGE)
  assert.equal(
    calmInviteError("You’re already in a home. Leave it in Settings before starting another."),
    ALREADY_IN_HOME_MESSAGE,
  )
  assert.equal(calmAccountError("A user with this email address has already been registered"), "That email already has a login. Sign in instead.")
  assert.equal(INVALID_CODE_MESSAGE.includes("DeanFamily"), false)
  assert.equal(ALREADY_IN_HOME_MESSAGE.includes("Join"), false)
})

test("migration locks create-home codes to owners and a redeem transaction", () => {
  assert.match(sql, /create table public\.household_invite_codes/)
  assert.match(sql, /purpose text not null default 'create_household'/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /household_invite_codes_select_owner/)
  assert.match(sql, /is_household_owner\(household_id\)/)
  assert.match(sql, /redeem_household_invite_code/)
  assert.match(sql, /for update/)
  assert.match(sql, /uses = uses \+ 1/)
  assert.match(sql, /'owner'/)
  assert.match(sql, /My household/)
  assert.match(sql, /seed_default_categories/)
  assert.match(sql, /drop policy if exists households_insert_authenticated/)
  assert.match(sql, /drop policy if exists household_members_insert/)
  assert.match(sql, /grant execute on function public\.peek_household_invite_code\(text\) to anon, authenticated/)
  assert.match(sql, /revoke all on function public\.generate_invite_code\(\) from public, anon, authenticated/)
  assert.doesNotMatch(sql, /join_household/)
})
