export const WIDGET_IDS = ["money", "tasks", "calendar", "goals", "reminders"] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export type LayoutItem = {
  id: WidgetId
  visible: boolean
}

export function defaultLayout(): LayoutItem[] {
  return WIDGET_IDS.map((id) => ({ id, visible: true }))
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && WIDGET_IDS.includes(value as WidgetId)
}

export function normalizeLayout(input: unknown): LayoutItem[] {
  const seen = new Set<WidgetId>()
  const items: LayoutItem[] = []

  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== "object") continue
      const id = (raw as { id?: unknown }).id
      if (!isWidgetId(id) || seen.has(id)) continue
      seen.add(id)
      items.push({ id, visible: (raw as { visible?: unknown }).visible !== false })
    }
  }

  if (items.length === 0) return defaultLayout()

  for (const fallback of defaultLayout()) {
    if (!seen.has(fallback.id)) items.push({ id: fallback.id, visible: false })
  }

  return items
}

export function moveItem(items: LayoutItem[], id: WidgetId, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= items.length) return items
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item)
  return copy
}

export function setVisible(items: LayoutItem[], id: WidgetId, visible: boolean) {
  return items.map((item) => (item.id === id ? { ...item, visible } : item))
}
