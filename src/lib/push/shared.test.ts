import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  parsePushSubscription,
  pushGuidance,
  safeNotificationPath,
  sharedPushMessage,
  shouldNotifySharedCreate,
} from "./shared.ts"

const ITEM = "11111111-1111-4111-8111-111111111111"

test("only shared bills, tasks, events, meals, and shopping notify", () => {
  for (const kind of ["bill", "task", "event", "meal", "shopping"]) {
    assert.equal(shouldNotifySharedCreate(kind, "shared"), true)
    assert.equal(shouldNotifySharedCreate(kind, "private"), false)
  }
  assert.equal(shouldNotifySharedCreate("note", "shared"), false)
  assert.equal(shouldNotifySharedCreate("note", "private"), false)
  assert.equal(shouldNotifySharedCreate("upload", "shared"), false)
  assert.equal(shouldNotifySharedCreate("expense", "shared"), false)
})

test("shared push copy stays calm and deep-links to the item", () => {
  const messages = [
    sharedPushMessage({ kind: "bill", actorName: "Alex Rivera", label: "Electric", entityId: ITEM }),
    sharedPushMessage({ kind: "task", actorName: "Alex", label: "Take out recycling", entityId: ITEM }),
    sharedPushMessage({ kind: "event", actorName: "Alex", label: "Dinner with Mom", entityId: ITEM }),
    sharedPushMessage({ kind: "meal", actorName: "Alex", label: "Tacos", entityId: ITEM }),
    sharedPushMessage({ kind: "shopping", actorName: "Alex", label: "Milk", entityId: ITEM }),
  ]
  const banned = [/overdue/i, /urgent/i, /alert/i, /warning/i, /failed/i, /debt/i, /past due/i, /\$/]
  for (const message of messages) {
    assert.equal(message.title, "Deanly Tracking")
    assert.equal(message.body.includes("Alex"), true)
    assert.equal(message.url.startsWith("/"), true)
    assert.equal(message.url.includes(`#item-${ITEM}`), true)
    for (const pattern of banned) assert.equal(pattern.test(message.body), false, message.body)
  }
  assert.equal(messages[0]?.url, `/money/bills#item-${ITEM}`)
  assert.equal(messages[1]?.url, `/life/tasks#item-${ITEM}`)
  assert.equal(messages[2]?.url, `/life/calendar#item-${ITEM}`)
  assert.equal(messages[3]?.url, `/life/meals#item-${ITEM}`)
  assert.equal(messages[4]?.url, `/life/shopping#item-${ITEM}`)
})

test("notification paths stay on this site", () => {
  assert.equal(safeNotificationPath("//evil.example"), "/home")
  assert.equal(safeNotificationPath("https://evil.example"), "/home")
  assert.equal(safeNotificationPath("/life/shopping#item-1"), "/life/shopping#item-1")
})

test("subscription endpoints must be https push urls", () => {
  assert.equal(
    parsePushSubscription({
      endpoint: "https://web.push.apple.com/example",
      keys: { p256dh: "a".repeat(20), auth: "b".repeat(12) },
    })?.endpoint,
    "https://web.push.apple.com/example",
  )
  assert.equal(parsePushSubscription({ endpoint: "http://evil.example", keys: { p256dh: "a".repeat(20), auth: "b".repeat(12) } }), null)
})

const seen = { detected: true as const, notificationPermission: "default" as const }

test("iPhone Safari tabs are sent to Add to Home Screen, not a subscribe toggle", () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1"
  const tab = pushGuidance({
    ...seen,
    userAgent: ios,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: false,
    pushSupported: true,
    vapidReady: true,
  })
  assert.equal(tab.showIosHomeScreen, true)
  assert.equal(tab.canSubscribe, false)

  const installed = pushGuidance({
    ...seen,
    userAgent: ios,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: true,
    pushSupported: true,
    vapidReady: true,
  })
  assert.equal(installed.canSubscribe, true)
  assert.equal(installed.showIosHomeScreen, false)
})

test("iOS before 16.4 cannot subscribe", () => {
  const guidance = pushGuidance({
    ...seen,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: true,
    pushSupported: false,
    vapidReady: true,
  })
  assert.equal(guidance.showIosTooOld, true)
  assert.equal(guidance.canSubscribe, false)
})

test("a desktop browser can subscribe when VAPID is configured", () => {
  const ready = pushGuidance({
    ...seen,
    userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
    platform: "MacIntel",
    maxTouchPoints: 0,
    standalone: false,
    pushSupported: true,
    vapidReady: true,
  })
  assert.equal(ready.canSubscribe, true)
  assert.equal(ready.showIosHomeScreen, false)

  const missing = pushGuidance({
    ...seen,
    userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
    platform: "MacIntel",
    maxTouchPoints: 0,
    standalone: false,
    pushSupported: true,
    vapidReady: false,
  })
  assert.equal(missing.canSubscribe, false)
  assert.equal(missing.showNotConfigured, true)
})

test("the service worker shows every push and does not intercept page loads", () => {
  const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8")
  assert.match(source, /showNotification\(/)
  assert.doesNotMatch(source, /addEventListener\(\s*["']fetch["']/)
})

test("guidance stays quiet until the device has been read", () => {
  const guidance = pushGuidance({
    detected: false,
    userAgent: "",
    platform: "",
    maxTouchPoints: 0,
    standalone: false,
    pushSupported: false,
    vapidReady: false,
    notificationPermission: "unknown",
  })
  assert.equal(guidance.canSubscribe, false)
  assert.equal(guidance.showUnsupported, false)
  assert.equal(guidance.showNotConfigured, false)
})
