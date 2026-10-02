/* Deanly Tracking Web Push service worker.
 * Push-only: no fetch handler, so Next.js pages and auth cookies are left alone.
 * Every push calls showNotification. Safari drops silent pushes.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function safePath(value) {
  if (typeof value !== "string") return "/home"
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/home"
  return value
}

function readPayload(event) {
  const fallback = {
    title: "Deanly Tracking",
    body: "Something shared was added at home.",
    url: "/home",
    tag: "deanly-shared",
  }
  if (!event.data) return fallback
  try {
    const data = event.data.json()
    return {
      title: typeof data.title === "string" && data.title.trim() ? data.title.slice(0, 80) : fallback.title,
      body: typeof data.body === "string" && data.body.trim() ? data.body.slice(0, 180) : fallback.body,
      url: safePath(data.url),
      tag: typeof data.tag === "string" && data.tag.trim() ? data.tag.slice(0, 120) : fallback.tag,
    }
  } catch {
    return fallback
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event)
  const show = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: payload.tag,
    data: { url: payload.url },
  })
  event.waitUntil(
    show.catch(() =>
      self.registration.showNotification("Deanly Tracking", {
        body: "Something shared was added at home.",
        icon: "/icons/icon-192.png",
        data: { url: "/home" },
      }),
    ),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        if (typeof client.navigate === "function") {
          try {
            await client.navigate(target)
            return client.focus()
          } catch {
            // Opening a fresh window still lands on the item.
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })(),
  )
})
