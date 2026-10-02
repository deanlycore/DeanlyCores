import assert from "node:assert/strict"
import test from "node:test"

import { withRemember } from "./cookies.ts"
import { authRedirectTarget } from "./redirects.ts"

const PATHS = [
  "/",
  "/login",
  "/forgot-password",
  "/join",
  "/home",
  "/settings",
  "/auth/callback",
  "/auth/update-password",
  "/preview/home",
  "/money",
  "/sw.js",
  "/manifest.webmanifest",
]

function settles(start: string, signedIn: boolean) {
  let path = start
  const seen = new Set<string>()
  for (let hop = 0; hop < 6; hop += 1) {
    if (seen.has(path)) return false
    seen.add(path)
    const next = authRedirectTarget(path, signedIn)
    if (!next || next === path) return true
    path = next
  }
  return false
}

test("auth redirects settle for logged-out and logged-in visitors", () => {
  for (const signedIn of [false, true]) {
    for (const path of PATHS) {
      assert.equal(settles(path, signedIn), true, `${signedIn ? "in" : "out"} ${path}`)
    }
  }
})

test("logged-out visitors reach login and stay there", () => {
  assert.equal(authRedirectTarget("/", false), "/login")
  assert.equal(authRedirectTarget("/home", false), "/login")
  assert.equal(authRedirectTarget("/login", false), null)
  assert.equal(authRedirectTarget("/forgot-password", false), null)
  assert.equal(authRedirectTarget("/join", false), null)
  assert.equal(authRedirectTarget("/auth/update-password", false), null)
  assert.equal(authRedirectTarget("/preview/home", false), null)
  assert.equal(authRedirectTarget("/sw.js", false), null)
  assert.equal(authRedirectTarget("/manifest.webmanifest", false), null)
})

test("logged-in visitors reach home and stay there", () => {
  assert.equal(authRedirectTarget("/login", true), "/home")
  assert.equal(authRedirectTarget("/", true), "/home")
  assert.equal(authRedirectTarget("/forgot-password", true), "/home")
  assert.equal(authRedirectTarget("/join", true), null)
  assert.equal(authRedirectTarget("/home", true), null)
  assert.equal(authRedirectTarget("/settings", true), null)
  assert.equal(authRedirectTarget("/auth/update-password", true), null)
  assert.equal(authRedirectTarget("/sw.js", true), null)
  assert.equal(authRedirectTarget("/manifest.webmanifest", true), null)
})

test("forgetting the browser still deletes auth cookies", () => {
  const session = { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 }
  const forgotten = withRemember(session, false)
  assert.equal(forgotten?.maxAge, undefined)
  assert.equal(forgotten?.path, "/")

  const cleared = withRemember({ path: "/", httpOnly: true, maxAge: 0 }, false)
  assert.equal(cleared?.maxAge, 0)

  const expired = withRemember({ path: "/", expires: new Date(0) }, false)
  assert.ok(expired?.expires instanceof Date)
})
