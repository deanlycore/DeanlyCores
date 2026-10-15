"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { formatMoney, parseCents } from "@/lib/home/metrics"
import { centsInput } from "@/lib/money/board"
import {
  OPEN_BILL_EVENT,
  SAFETY_BUFFER_KEY,
  SNAPSHOT_COPY,
  moneyBillOpenHref,
  snapshotAvailable,
  snapshotMoney,
  type MoneySnapshotModel,
  type SnapshotAttention,
} from "@/lib/money/snapshot"
import { cn } from "cn"

function subscribeBuffer(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(SAFETY_BUFFER_KEY, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(SAFETY_BUFFER_KEY, onStoreChange)
  }
}

function readSafetyBuffer() {
  try {
    const raw = window.localStorage.getItem(SAFETY_BUFFER_KEY)
    if (!raw || !/^\d+$/.test(raw)) return 0
    const cents = Number(raw)
    if (!Number.isSafeInteger(cents) || cents > 100_000_000) return 0
    return cents
  } catch {
    return 0
  }
}

function writeSafetyBuffer(cents: number) {
  const safe = Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000 ? cents : 0
  try {
    window.localStorage.setItem(SAFETY_BUFFER_KEY, String(safe))
    window.dispatchEvent(new Event(SAFETY_BUFFER_KEY))
  } catch {
    // Stay on this device. A full disk does not create a shared row.
  }
}

export function useSafetyBuffer() {
  const cents = useSyncExternalStore(subscribeBuffer, readSafetyBuffer, () => 0)
  return [cents, writeSafetyBuffer] as const
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink">{label}</span>
      <span className="text-right tabular-nums text-muted-foreground">{children}</span>
    </li>
  )
}

function Missing({ note, currency }: { note: string; currency: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{formatMoney(0, currency)}</span>
      <span>{note}</span>
    </span>
  )
}

function BufferAmount({
  cents,
  currency,
  onSave,
}: {
  cents: number
  currency: string
  onSave: (cents: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  function commit() {
    const parsed = parseCents(draft)
    if (parsed == null) onSave(draft.trim() === "" ? 0 : cents)
    else onSave(parsed)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Edit ${SNAPSHOT_COPY.buffer}`}
        onClick={() => {
          setDraft(centsInput(cents))
          setEditing(true)
        }}
        className="border-0 bg-transparent p-0 tabular-nums text-muted-foreground"
      >
        {snapshotMoney(cents, currency, true)}
      </button>
    )
  }

  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={SNAPSHOT_COPY.buffer}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          setEditing(false)
        }
      }}
      className="w-24 border-0 border-b border-border bg-transparent p-0 text-right text-sm tabular-nums text-muted-foreground outline-none"
    />
  )
}

export function MoneyAvailablePanel({
  model,
  currency,
  onSaveBuffer,
}: {
  model: MoneySnapshotModel
  currency: string
  onSaveBuffer: (cents: number) => void
}) {
  return (
    <>
      <p
        data-available
        className={
          model.hasIncome
            ? "overflow-visible font-display text-[22px] font-semibold leading-normal tabular-nums tracking-[-0.02em] text-ink md:text-[24px]"
            : "text-[15px] font-medium text-ink"
        }
      >
        {model.hasIncome && model.availableCents != null
          ? snapshotAvailable(model.availableCents, currency)
          : SNAPSHOT_COPY.addIncome}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{SNAPSHOT_COPY.window}</p>
      <ul className="mt-3 grid gap-1.5">
        <Line label={SNAPSHOT_COPY.income}>
          {model.hasIncome ? snapshotMoney(model.incomeCents, currency, false) : SNAPSHOT_COPY.noneYet}
        </Line>
        <Line label={SNAPSHOT_COPY.bills}>
          {model.hasBills ? (
            snapshotMoney(model.billsCents, currency, true)
          ) : (
            <Missing note={SNAPSHOT_COPY.noneYet} currency={currency} />
          )}
        </Line>
        <Line label={SNAPSHOT_COPY.savings}>
          {model.savingsState === "set"
            ? snapshotMoney(model.savingsCents, currency, true)
            : model.savingsState === "unset"
              ? SNAPSHOT_COPY.noContribution
              : SNAPSHOT_COPY.noneYet}
        </Line>
        <Line label={SNAPSHOT_COPY.subscriptions}>
          {model.hasSubscriptions ? snapshotMoney(model.subscriptionsCents, currency, true) : SNAPSHOT_COPY.noneYet}
        </Line>
        <Line label={SNAPSHOT_COPY.buffer}>
          <BufferAmount cents={model.bufferCents} currency={currency} onSave={onSaveBuffer} />
        </Line>
      </ul>
      {model.shortfall ? <p className="mt-3 text-sm text-muted-foreground">{SNAPSHOT_COPY.shortfall}</p> : null}
    </>
  )
}

export function MoneyAttentionPanel({
  attention,
  currency,
}: {
  attention: SnapshotAttention[]
  currency: string
}) {
  const pathname = usePathname()
  if (attention.length === 0) {
    return <p className="text-[15px] font-medium text-ink">{SNAPSHOT_COPY.noneYet}</p>
  }
  return (
    <ul className="grid">
      {attention.map((bill) => (
        <li key={bill.id}>
          <Link
            href={moneyBillOpenHref(pathname, bill.id)}
            onClick={() => {
              window.dispatchEvent(new CustomEvent(OPEN_BILL_EVENT, { detail: bill.id }))
            }}
            className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
          >
            <span className="min-w-0 truncate font-medium text-ink">{bill.name}</span>
            <span className="shrink-0 tabular-nums text-ink">{formatMoney(bill.leftCents, currency)}</span>
            <span
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] tabular-nums",
                bill.urgent ? "text-danger" : "text-muted-foreground",
              )}
            >
              {bill.urgent ? <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" /> : null}
              {bill.due}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
