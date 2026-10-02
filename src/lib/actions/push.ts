"use server"

import { headers } from "next/headers"

import { requireHousehold } from "@/lib/data/context"
import { getServiceRoleKey } from "@/lib/push/env"
import { parsePushSubscription } from "@/lib/push/shared"
import { getSupabaseUrl } from "@/lib/supabase/env"
import { createClient } from "@supabase/supabase-js"

export type ActionResult = { ok: true } | { ok: false; message: string }

async function deviceLabel() {
  const headerStore = await headers()
  const raw = headerStore.get("user-agent") ?? ""
  const clean = raw.replace(/[^\t\x20-\x7e]/g, "").trim().slice(0, 240)
  return clean || null
}

async function gate() {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first.", ctx: null }
  return { ok: true as const, message: "", ctx }
}

function serviceClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const parsed = parsePushSubscription(input)
  if (!parsed) return { ok: false, message: "That notification setup didn’t come through." }

  const row = {
    user_id: ready.ctx.userId,
    household_id: ready.ctx.householdId,
    endpoint: parsed.endpoint,
    p256dh: parsed.p256dh,
    auth: parsed.auth,
    user_agent: await deviceLabel(),
  }

  const write = await ready.ctx.supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" })
  if (!write.error) return { ok: true }

  if (write.error.code === "23505") {
    const admin = serviceClient()
    if (admin) {
      await admin.from("push_subscriptions").delete().eq("endpoint", parsed.endpoint)
      const retry = await ready.ctx.supabase.from("push_subscriptions").insert(row)
      if (!retry.error) return { ok: true }
    }
    return { ok: false, message: "This device is already used for notifications on the other account." }
  }

  return { ok: false, message: "Couldn’t save notifications for this device." }
}

export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const parsed = parsePushSubscription({ endpoint, keys: { p256dh: "x".repeat(16), auth: "x".repeat(8) } })
  if (!parsed) return { ok: false, message: "Couldn’t turn notifications off for this device." }
  const { error } = await ready.ctx.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", ready.ctx.userId)
    .eq("endpoint", parsed.endpoint)
  if (error) return { ok: false, message: "Couldn’t turn notifications off for this device." }
  return { ok: true }
}
