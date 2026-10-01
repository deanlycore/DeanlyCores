import assert from "node:assert/strict"
import test from "node:test"

test("client key prefers the legacy anon JWT", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-jwt"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example"
  const { getSupabaseClientKey } = await import("./env.ts")
  assert.equal(getSupabaseClientKey(), "legacy-anon-jwt")
})

test("client key falls back to the publishable key", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "your-anon-key"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example"
  const { getSupabaseClientKey } = await import("./env.ts")
  assert.equal(getSupabaseClientKey(), "sb_publishable_example")
})
