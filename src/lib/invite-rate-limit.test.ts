import assert from "node:assert/strict"
import test from "node:test"

import { allowInviteCodeCheck, inviteCheckClientIp } from "./invite-rate-limit.ts"

const start = 1_700_000_000_000

function ipAt(index: number) {
  const a = (index >> 16) & 255
  const b = (index >> 8) & 255
  const c = index & 255
  return `10.${a}.${b}.${c}`
}

test("an IP can check an invite code ten times a minute", () => {
  const store = new Map<string, number[]>()
  for (let i = 0; i < 10; i += 1) {
    assert.equal(allowInviteCodeCheck("203.0.113.8", start + i, store), true)
  }
  assert.equal(allowInviteCodeCheck("203.0.113.8", start + 10, store), false)
  assert.equal(allowInviteCodeCheck("203.0.113.9", start + 10, store), true)
  assert.equal(allowInviteCodeCheck("203.0.113.8", start + 60_000, store), true)
})

test("a missing, invalid, or broken check fails closed", () => {
  const store = new Map<string, number[]>()
  assert.equal(allowInviteCodeCheck("  ", start, store), false)
  assert.equal(allowInviteCodeCheck("not-an-ip", start, store), false)
  assert.equal(store.size, 0)
  const broken = {
    get() {
      throw new Error("store down")
    },
  } as unknown as Map<string, number[]>
  assert.equal(allowInviteCodeCheck("203.0.113.8", start, broken), false)
})

test("expired buckets are dropped and the map stays capped", () => {
  const store = new Map<string, number[]>()
  store.set("203.0.113.8", [start])
  store.set("203.0.113.9", [start])
  assert.equal(allowInviteCodeCheck("198.51.100.20", start + 60_000, store), true)
  assert.equal(store.has("203.0.113.8"), false)
  assert.equal(store.has("203.0.113.9"), false)
  assert.deepEqual(store.get("198.51.100.20"), [start + 60_000])

  const capped = new Map<string, number[]>()
  for (let i = 0; i < 10_000; i += 1) capped.set(ipAt(i), [start + i])
  assert.equal(allowInviteCodeCheck("198.51.100.21", start + 10_000, capped), true)
  assert.equal(capped.size, 10_000)
  assert.equal(capped.has(ipAt(0)), false)
  assert.deepEqual(capped.get("198.51.100.21"), [start + 10_000])
})

test("the client IP prefers the Vercel header and ignores invalid values", () => {
  assert.equal(
    inviteCheckClientIp((name) => {
      if (name === "x-vercel-forwarded-for") return "2001:db8::8"
      if (name === "x-forwarded-for") return "203.0.113.8"
      return null
    }),
    "2001:db8::8",
  )
  assert.equal(
    inviteCheckClientIp((name) => (name === "x-forwarded-for" ? " 203.0.113.8, 10.0.0.1 " : null)),
    "203.0.113.8",
  )
  assert.equal(
    inviteCheckClientIp((name) => (name === "x-vercel-forwarded-for" ? "not-an-ip" : "203.0.113.8")),
    "",
  )
  assert.equal(inviteCheckClientIp(() => null), "")
})
