import assert from "node:assert/strict"
import test from "node:test"
import webpush from "web-push"

import { getServiceRoleKey, getVapidConfig, getVapidPublicKey } from "./env.ts"

const keys = webpush.generateVAPIDKeys()

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>()
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    run()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test("placeholder VAPID values are not treated as real keys", () => {
  withEnv(
    {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "your-vapid-public-key",
      VAPID_PRIVATE_KEY: "your-vapid-private-key",
      VAPID_SUBJECT: "mailto:you@example.com",
      SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key",
    },
    () => {
      assert.equal(getVapidPublicKey(), null)
      assert.equal(getVapidConfig(), null)
      assert.equal(getServiceRoleKey(), null)
    },
  )
})

test("a generated VAPID pair is accepted with a mailto subject", () => {
  withEnv(
    {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:household@deanlycores.app",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    },
    () => {
      const config = getVapidConfig()
      assert.equal(config?.publicKey, keys.publicKey)
      assert.equal(config?.privateKey, keys.privateKey)
      assert.equal(config?.subject, "mailto:household@deanlycores.app")
      assert.equal(getServiceRoleKey(), "service-role-test-key")
    },
  )
})

test("a subject must be mailto or https", () => {
  withEnv(
    {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "household@deanlycores.app",
    },
    () => {
      assert.equal(getVapidConfig(), null)
    },
  )
})
