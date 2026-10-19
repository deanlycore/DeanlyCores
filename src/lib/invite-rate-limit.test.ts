import assert from "node:assert/strict"
import test from "node:test"

import { allowInviteCodeCheck, inviteCheckClientIp } from "./invite-rate-limit.ts"

const start = 1_700_000_000_000

test("an IP can check an invite code ten times a minute", () => {
  const store = new Map<string, number[]>()
  for (let i = 0; i < 10; i += 1) {
    assert.equal(allowInviteCodeCheck("203.0.113.8", start + i, store), true)
  }
  assert.equal(allowInviteCodeCheck("203.0.113.8", start + 10, store), false)
  assert.equal(allowInviteCodeCheck("203.0.113.9", start + 10, store), true)
  assert.equal(allowInviteCodeCheck("203.0.113.8", start + 60_000, store), true)
})

test("a missing IP or a broken store fails closed", () => {
  assert.equal(allowInviteCodeCheck("  ", start), false)
  const broken = {
    get() {
      throw new Error("store down")
    },
  } as unknown as Map<string, number[]>
  assert.equal(allowInviteCodeCheck("203.0.113.8", start, broken), false)
})

test("the client IP is the first forwarded address", () => {
  assert.equal(
    inviteCheckClientIp((name) => (name === "x-forwarded-for" ? " 203.0.113.8, 10.0.0.1 " : null)),
    "203.0.113.8",
  )
  assert.equal(
    inviteCheckClientIp((name) => (name === "x-real-ip" ? "2001:db8::8" : null)),
    "2001:db8::8",
  )
  assert.equal(inviteCheckClientIp(() => null), "")
})
