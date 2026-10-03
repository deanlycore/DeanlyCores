"use client"

import { useSyncExternalStore } from "react"
import { ChevronDown } from "lucide-react"

import { formatMoney } from "@/lib/home/metrics"
import { defaultGroupOpen, type MoneyGroup, type MoneyGroupSection } from "@/lib/money/board"
import { cn } from "cn"

const STORAGE_KEY = "deanly-money-group-open"
const STORAGE_EVENT = "deanly-money-group-open"

type OpenStore = Record<string, boolean>

function storageKey(section: string, label: string) {
  return `${section}:${label}`
}

function readStore(): OpenStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const store: OpenStore = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") store[key] = value
    }
    return store
  } catch {
    return {}
  }
}

function subscribeOpen(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(STORAGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(STORAGE_EVENT, onChange)
  }
}

function writeOpen(section: string, label: string, open: boolean) {
  const next = { ...readStore(), [storageKey(section, label)]: open }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(STORAGE_EVENT))
}

function useGroupOpen(section: string, label: string, sectionCount: number, groupCount: number) {
  const key = storageKey(section, label)
  const fallback = defaultGroupOpen(sectionCount, groupCount)
  const open = useSyncExternalStore(
    subscribeOpen,
    () => {
      const stored = readStore()[key]
      return typeof stored === "boolean" ? stored : fallback
    },
    () => fallback,
  )
  function toggle() {
    const stored = readStore()[key]
    const current = typeof stored === "boolean" ? stored : fallback
    writeOpen(section, label, !current)
  }
  return { open, toggle }
}

export function MoneyGroups<T extends { id: string }>({
  section,
  sectionCount,
  groups,
  currency,
  renderRow,
}: {
  section: MoneyGroupSection
  sectionCount: number
  groups: MoneyGroup<T>[]
  currency: string
  renderRow: (row: T) => React.ReactNode
}) {
  if (groups.length === 0) return null
  return (
    <div>
      {groups.map((group) => (
        <GroupBlock
          key={group.label}
          section={section}
          sectionCount={sectionCount}
          label={group.label}
          count={group.rows.length}
          totalCents={group.totalCents}
          currency={currency}
        >
          {group.rows.map((row) => (
            <div key={row.id}>{renderRow(row)}</div>
          ))}
        </GroupBlock>
      ))}
    </div>
  )
}

function GroupBlock({
  section,
  sectionCount,
  label,
  count,
  totalCents,
  currency,
  children,
}: {
  section: string
  sectionCount: number
  label: string
  count: number
  totalCents: number | null
  currency: string
  children: React.ReactNode
}) {
  const { open, toggle } = useGroupOpen(section, label, sectionCount, count)
  const meta = totalCents == null ? String(count) : `${count} · ${formatMoney(totalCents, currency)}`
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-3 py-2 text-left max-md:min-h-11"
      >
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">{meta}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", !open && "-rotate-90")}
        />
      </button>
      {open ? <div className="grid gap-2.5 pb-1">{children}</div> : null}
    </div>
  )
}
