"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { MoreHorizontal, Plus } from "lucide-react"

import { LoopMark } from "@/components/brand/loop-mark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PulseCell } from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

const FILTER_KEY = "deanly-money-visibility"

/** Phone sheets sit on the bottom edge. Desktop dialogs stay centered. */
export const phoneSheetClass =
  "max-md:top-auto! max-md:right-0! max-md:bottom-0! max-md:left-0! max-md:w-full! max-md:max-w-none! max-md:translate-x-0! max-md:translate-y-0! max-md:rounded-t-2xl! max-md:rounded-b-none! max-md:max-h-[92dvh]! max-md:overflow-y-auto! max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]!"

export type MoneyVisibility = "all" | "shared" | "private"

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

export function useMoneyVisibility() {
  const filter = useSyncExternalStore(subscribeVisibility, readVisibility, () => "all" as const)
  function setFilter(next: MoneyVisibility) {
    window.localStorage.setItem(FILTER_KEY, next)
    window.dispatchEvent(new Event(FILTER_KEY))
  }
  return { filter, setFilter }
}

export function useRowPatches<T extends { id: string }>() {
  const [patches, setPatches] = useState<Record<string, Partial<T>>>({})
  function patch(id: string, next: Partial<T>) {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...next } }))
  }
  function merge(rows: T[]) {
    return rows.map((row) => (patches[row.id] ? { ...row, ...patches[row.id] } : row))
  }
  return { patch, merge }
}

export function useScrollToItemHash() {
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id.startsWith("item-")) return
    document.getElementById(id)?.scrollIntoView({ block: "center" })
  }, [])
}

export function MoneyFrame({
  title,
  subtitle,
  action,
  filter,
  onFilter,
  chips,
  pulse,
  children,
  phoneTouch = false,
}: {
  title: string
  subtitle: string
  action: React.ReactNode
  filter: MoneyVisibility
  onFilter: (next: MoneyVisibility) => void
  chips: React.ReactNode
  pulse: React.ReactNode
  children: React.ReactNode
  /** Life phone boards raise the visibility control to a 44px target. Money stays as-is. */
  phoneTouch?: boolean
}) {
  return (
    <div className="relative grid gap-5">
      <div aria-hidden="true" className="deanly-wash pointer-events-none absolute -left-6 -top-8 z-0 h-40 w-72" />
      <div className="relative z-10 grid gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[30px]">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <VisibilityFilter value={filter} onChange={onFilter} phoneTouch={phoneTouch} />
            {action}
          </div>
        </header>
        {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
        {pulse}
        <div className="grid gap-2.5">{children}</div>
      </div>
    </div>
  )
}

const filterOptions: { id: MoneyVisibility; label: string }[] = [
  { id: "shared", label: "Shared" },
  { id: "private", label: "Just me" },
  { id: "all", label: "All" },
]

export function VisibilityFilter({
  value,
  onChange,
  phoneTouch = false,
}: {
  value: MoneyVisibility
  onChange: (next: MoneyVisibility) => void
  phoneTouch?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Visibility" className="inline-flex max-w-full rounded-full border border-border bg-surface p-0.5">
      {filterOptions.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-medium transition-colors duration-150",
              phoneTouch && "max-md:min-h-11 max-md:px-3.5",
              selected && option.id === "shared" && "bg-brand-soft text-on-brand-soft",
              selected && option.id === "private" && "bg-sand text-sand-ink",
              selected && option.id === "all" && "bg-surface-muted text-ink",
              !selected && "text-muted-foreground hover:text-ink",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function MoneyAddButton({ children, className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <Button type={type} className={cn("h-10 rounded-button px-3.5 text-primary-foreground", className)} {...props}>
      <Plus className="size-4" aria-hidden="true" />
      {children}
    </Button>
  )
}

export function MetricChip({
  children,
  tone = "muted",
  pressed = false,
  onClick,
}: {
  children: React.ReactNode
  tone?: "muted" | "brand" | "danger" | "success" | "sand"
  pressed?: boolean
  onClick?: () => void
}) {
  const toneClass = {
    muted: "border-border bg-surface text-muted-foreground",
    brand: "border-transparent bg-brand-soft text-on-brand-soft",
    danger: "border-border bg-surface text-danger",
    success: "border-transparent bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))] text-success",
    sand: "border-transparent bg-sand text-sand-ink",
  }[tone]
  const className = cn(
    "inline-flex h-8 items-center rounded-full border px-3 text-[13px] tabular-nums",
    toneClass,
    pressed && "ring-1 ring-brand/40",
  )
  if (!onClick) return <span className={className}>{children}</span>
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={className}>
      {children}
    </button>
  )
}

export function RhythmStrip({ title, cells, empty }: { title: string; cells: PulseCell[]; empty: string }) {
  return (
    <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
      <h2 className="text-[13px] font-medium text-ink">{title}</h2>
      {cells.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {cells.map((cell) => (
            <li
              key={cell.id}
              className={cn(
                "flex min-w-[80px] max-w-[120px] flex-1 flex-col gap-1 rounded-[10px] px-2.5 py-2.5",
                cell.tone === "soon" && "bg-brand-soft text-on-brand-soft",
                cell.tone !== "soon" && "bg-surface-muted text-ink",
              )}
            >
              <span className="text-[15px] font-medium tabular-nums leading-none">{cell.day}</span>
              <span className="truncate text-xs">{cell.title}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 truncate text-xs tabular-nums",
                  cell.tone === "soon" && "text-on-brand-soft",
                  cell.tone === "overdue" && "text-danger",
                  cell.tone !== "soon" && cell.tone !== "overdue" && "text-muted-foreground",
                )}
              >
                {cell.tone === "overdue" ? <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" /> : null}
                {cell.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function MoneyCard({
  id,
  children,
  onOpen,
  linked = false,
}: {
  id?: string
  children: React.ReactNode
  onOpen?: () => void
  /** Hover lift when the card body is already a link. */
  linked?: boolean
}) {
  return (
    <article
      id={id}
      onClick={onOpen}
      className={cn(
        "scroll-mt-24 rounded-[12px] border border-border bg-surface px-4 py-3.5 shadow-soft transition-transform duration-150 ease-out",
        (onOpen || linked) && "cursor-pointer hover:-translate-y-px",
      )}
    >
      {children}
    </article>
  )
}

export function StatusDisc({ tone }: { tone: "upcoming" | "paid" | "overdue" | "muted" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1.5 size-2 shrink-0 rounded-full",
        tone === "upcoming" && "bg-brand-soft ring-1 ring-brand",
        tone === "paid" && "bg-[color-mix(in_srgb,var(--success)_45%,var(--surface))]",
        tone === "overdue" && "bg-danger",
        tone === "muted" && "bg-surface-muted ring-1 ring-border",
      )}
    />
  )
}

export function EmptyState({ copy, action }: { copy: string; action: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-5 py-8 text-center shadow-soft">
      <LoopMark size={28} className="mx-auto" />
      <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">{copy}</p>
      <div className="mt-4 flex justify-center">{action}</div>
    </div>
  )
}

export function FilterEmpty({ onClear, copy = "Nothing matches these filters." }: { onClear: () => void; copy?: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-5 py-8 text-center shadow-soft">
      <p className="text-sm text-muted-foreground">{copy}</p>
      <button type="button" onClick={onClear} className="mt-3 text-sm font-medium text-brand-deep">
        Clear filters
      </button>
    </div>
  )
}

export function RowMenu({
  label,
  visibility,
  onEdit,
  onVisibility,
  onRemove,
  extra,
  className,
}: {
  label: string
  visibility: Visibility
  onEdit: () => void
  onVisibility: (next: Visibility) => void
  onRemove: () => void
  extra?: React.ReactNode
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${label} actions`}
          className={cn("text-muted-foreground", className)}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onVisibility(visibility === "shared" ? "private" : "shared")}>
          {visibility === "shared" ? "Make Just me" : "Make Shared"}
        </DropdownMenuItem>
        {extra}
        <DropdownMenuItem onSelect={onRemove}>Remove</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ConfirmRemove({
  open,
  title,
  pending,
  onOpenChange,
  onConfirm,
  sheetOnPhone = false,
}: {
  open: boolean
  title: string
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  sheetOnPhone?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[440px]", sheetOnPhone && phoneSheetClass)}>
        {sheetOnPhone ? <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" /> : null}
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" className="h-10 rounded-button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <button type="button" disabled={pending} onClick={onConfirm} className="text-sm font-medium text-danger disabled:opacity-50">
            {pending ? "Removing…" : "Remove"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
