import "server-only"

import { createClient } from "@supabase/supabase-js"
import webpush from "web-push"

import { getSupabaseUrl } from "@/lib/supabase/env"
import { getServiceRoleKey, getVapidConfig } from "@/lib/push/env"
import { sharedPushMessage, type SharedPushKind } from "@/lib/push/shared"

type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

function serviceClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Tell the other household members that a Shared item was added.
 * Failures stay here so saving the item still succeeds.
 * Every payload is shown by the service worker; this never sends an empty body.
 */
export async function notifySharedCreate(input: {
  householdId: string
  actorId: string
  actorName: string
  kind: SharedPushKind
  entityId: string
  label: string
}) {
  try {
    const vapid = getVapidConfig()
    const admin = serviceClient()
    if (!vapid || !admin) {
      console.warn("Shared push skipped: set VAPID keys and SUPABASE_SERVICE_ROLE_KEY.")
      return
    }

    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("household_id", input.householdId)
      .neq("user_id", input.actorId)

    if (error || !data?.length) {
      if (error) console.warn("Shared push skipped:", error.message)
      return
    }

    const message = sharedPushMessage(input)
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
      tag: message.tag,
    })

    await Promise.all(
      (data as SubscriptionRow[]).map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            payload,
            { TTL: 60 * 60, urgency: "high", timeout: 8000 },
          )
        } catch (sendError) {
          const status = sendError && typeof sendError === "object" && "statusCode" in sendError
            ? Number(sendError.statusCode)
            : 0
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", row.id)
            return
          }
          const detail = sendError instanceof Error ? sendError.message : "send failed"
          console.warn("Shared push was not delivered.", detail)
        }
      }),
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown"
    console.warn("Shared push was not sent.", detail)
  }
}
