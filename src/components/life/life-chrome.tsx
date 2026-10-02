"use client"

import { useSyncExternalStore } from "react"

import type { WeekDayCell } from "@/lib/life/board"
import type { MoneyVisibility } from "@/components/money/money-chrome"
import { cn } from "cn"

const FILTER_KEY = "deanly-life-visibility"

function subscribeVisibility(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(FILTER_KEY, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(FILTER_KEY, onStoreChange)
  }
}

function readVisibility(): MoneyVisibility {
  const stored = window.localStorage.getItem(FILTER_KEY)
  if (stored === "all" || stored === "shared" || stored === "private") return stored
  return "all"
}

export function useLifeVisibility() {
  const filter = useSyncExternalStore(subscribeVisibility, readVisibility, () => "all" as const)
  function setFilter(next: MoneyVisibility) {
    window.localStorage.setItem(FILTER_KEY, next)
    window.dispatchEvent(new Event(FILTER_KEY))
  }
  return { filter, setFilter }
}

export function WeekStrip({
  title,
  cells,
  empty,
  filled,
}: {
  title: string
  cells: WeekDayCell[]
  empty: string
  filled: boolean
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
      <h2 className="text-[13px] font-medium text-ink">{title}</h2>
      {filled ? (
        <ul className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          {cells.map((cell) => (
            <li
              key={cell.id}
              className={cn(
                "flex min-w-16 shrink-0 snap-start flex-col gap-1 rounded-[10px] px-2 py-2.5 md:min-w-[4.75rem]",
                cell.today ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-ink",
              )}
            >
              <span className="text-[13px] font-medium">{cell.weekday}</span>
              {cell.labels.map((label) => (
                <span
                  key={label}
                  className={cn(
                    "truncate text-xs",
                    cell.today ? "text-on-brand-soft" : cell.quiet ? "text-muted-foreground" : "text-ink",
                  )}
                >
                  {label}
                </span>
              ))}
              {cell.more > 0 ? <span className="text-xs">+{cell.more}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

export function LifeFab({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-end px-4 md:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto">{children}</div>
    </div>
  )
}

/** Phone lists already have pb-24 under the tab bar. This adds the FAB height plus a gap, on small screens only. */
export function PhoneFabClearance() {
  return <div aria-hidden="true" className="h-[calc(3rem+env(safe-area-inset-bottom))] md:hidden" />
}

export function CheckControl({
  checked,
  label,
  onToggle,
}: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border",
          checked
            ? "border-success bg-[color-mix(in_srgb,var(--success)_18%,var(--surface))]"
            : "border-border bg-surface",
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-success" /> : null}
      </span>
    </button>
  )
}
