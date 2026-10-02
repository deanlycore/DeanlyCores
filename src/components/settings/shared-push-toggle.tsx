"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { deletePushSubscription, savePushSubscription } from "@/lib/actions/push"
import { pushGuidance, type PushClientFacts } from "@/lib/push/shared"
import { Switch } from "@/components/ui/switch"

const undetected: PushClientFacts = {
  detected: false,
  userAgent: "",
  platform: "",
  maxTouchPoints: 0,
  standalone: false,
  pushSupported: false,
  vapidReady: false,
  notificationPermission: "unknown",
}
const undetectedReady: PushClientFacts = { ...undetected, vapidReady: true }

let cachedFacts: PushClientFacts | null = null
let cachedKey = ""

function readDevice(vapidReady: boolean): PushClientFacts {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true
  const permission = typeof Notification === "undefined" ? "unknown" : Notification.permission
  const key = [vapidReady, navigator.userAgent, navigator.platform, navigator.maxTouchPoints, standalone, permission].join("|")
  if (cachedFacts && cachedKey === key) return cachedFacts
  cachedKey = key
  cachedFacts = {
    detected: true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    pushSupported: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    vapidReady,
    notificationPermission: permission,
  }
  return cachedFacts
}

function useDevice(vapidReady: boolean) {
  return useSyncExternalStore(
    () => () => {},
    () => readDevice(vapidReady),
    () => (vapidReady ? undetectedReady : undetected),
  )
}

function urlBase64ToUint8Array(value: string) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export function SharedPushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const facts = useDevice(Boolean(vapidPublicKey))
  const guidance = pushGuidance(facts)
  const [enabled, setEnabled] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const denied = facts.notificationPermission === "denied" || blocked

  useEffect(() => {
    if (!guidance.canSubscribe || !("serviceWorker" in navigator)) return
    let cancel = false
    navigator.serviceWorker.ready
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription()
        if (cancel) return
        setEnabled(Boolean(existing))
        if (!existing) return
        const saved = await savePushSubscription(existing.toJSON())
        if (!cancel && !saved.ok) setMessage(saved.message)
      })
      .catch(() => {
        if (!cancel) setEnabled(false)
      })
    return () => {
      cancel = true
    }
  }, [guidance.canSubscribe])

  async function onCheckedChange(checked: boolean) {
    if (!guidance?.canSubscribe || !vapidPublicKey || pending) return
    setPending(true)
    setMessage(null)
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      await navigator.serviceWorker.ready
      if (!checked) {
        const existing = await registration.pushManager.getSubscription()
        const endpoint = existing?.endpoint
        if (existing) await existing.unsubscribe()
        if (endpoint) {
          const removed = await deletePushSubscription(endpoint)
          if (!removed.ok) {
            setMessage(removed.message)
            setEnabled(true)
            return
          }
        }
        setEnabled(false)
        setMessage("Shared adds won’t notify this device.")
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      const saved = await savePushSubscription(subscription.toJSON())
      if (!saved.ok) {
        await subscription.unsubscribe()
        setEnabled(false)
        setMessage(saved.message)
        return
      }
      setEnabled(true)
      setBlocked(false)
      setMessage("You’ll get a note when something Shared is added.")
    } catch {
      const blockedNow = typeof Notification !== "undefined" && Notification.permission === "denied"
      setBlocked(blockedNow)
      setEnabled(false)
      setMessage(
        blockedNow
          ? "Notifications are blocked for Deanly Tracking. You can allow them in the browser settings when you want."
          : "Couldn’t turn notifications on from here.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Bills, tasks, meals, calendar plans, and the shopping list. Just me notes stay quiet.
      </p>
      {guidance?.showIosHomeScreen ? (
        <p className="text-sm text-muted-foreground">
          On iPhone, notifications start after Deanly Tracking is on your Home Screen. Open the Share menu, choose Add to
          Home Screen, then open Deanly Tracking from that icon and turn this on.
        </p>
      ) : null}
      {guidance?.showIosTooOld ? (
        <p className="text-sm text-muted-foreground">This iPhone needs iOS 16.4 or later for notifications.</p>
      ) : null}
      {guidance?.showUnsupported ? (
        <p className="text-sm text-muted-foreground">This browser can’t deliver those notifications.</p>
      ) : null}
      {guidance?.showNotConfigured ? (
        <p className="text-sm text-muted-foreground">Notifications aren’t available on this Deanly Tracking yet.</p>
      ) : null}
      {guidance?.canSubscribe ? (
        <label className="flex items-center justify-between gap-4">
          <span className="font-medium">Notify me when something Shared is added</span>
          <Switch
            checked={enabled}
            disabled={pending || denied}
            onCheckedChange={onCheckedChange}
            aria-label="Notify me when something Shared is added"
          />
        </label>
      ) : null}
      {denied && guidance?.canSubscribe ? (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for Deanly Tracking. You can allow them in the browser settings when you want.
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
