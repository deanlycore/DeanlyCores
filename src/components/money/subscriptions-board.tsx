"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { LifeFab, PhoneFabClearance } from "@/components/life/life-chrome"
import {
  CategoryLine,
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyCategoryBlock,
  MoneyFrame,
  type MoneyVisibility,
  RhythmStrip,
  RowMenu,
  StatusDisc,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteSubscription, setSubscriptionActive, setSubscriptionVisibility } from "@/lib/actions/records"
import type { SubscriptionRow } from "@/lib/data/home"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import {
  MONEY_COPY,
  PHONE_MONEY_COPY,
  amountLabel,
  applyVisibility,
  centsInput,
  moneySubtitle,
  renewalPulseCells,
  sortSubscriptions,
  subscriptionMetrics,
} from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export function SubscriptionsBoard({
  rows,
  currency,
  today,
  householdName,
  error,
  scan = false,
  scanFilter,
}: {
  rows: SubscriptionRow[]
  currency: string
  today: string
  householdName?: string | null
  error?: boolean
  scan?: boolean
  scanFilter?: MoneyVisibility
}) {
  const router = useRouter()
  const { filter: storedFilter, setFilter } = useMoneyVisibility()
  const filter = scan ? (scanFilter ?? "all") : storedFilter
  const { patch, merge } = useRowPatches<SubscriptionRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SubscriptionRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<SubscriptionRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortSubscriptions(applyVisibility(items, filter))
  const metrics = subscriptionMetrics(visible, today)
  const pulse = renewalPulseCells(visible, today, currency)

  function openEdit(row: SubscriptionRow) {
    setEditing(row)
    setEditOpen(true)
  }

  async function changeVisibility(row: SubscriptionRow, visibility: Visibility) {
    const previous = row.visibility
    patch(row.id, { visibility })
    const result = await setSubscriptionVisibility(row.id, visibility)
    if (!result.ok) {
      patch(row.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  async function toggleActive(row: SubscriptionRow) {
    const next = !row.active
    patch(row.id, { active: next })
    const result = await setSubscriptionActive(row.id, next)
    if (!result.ok) {
      patch(row.id, { active: row.active })
      toast(result.message)
      return
    }
    router.refresh()
  }

  const list = (
    <>
      {error ? <WidgetError /> : null}
      {scan ? (
        items.length === 0 ? (
          <CategoryLine>{MONEY_COPY.subscriptionsEmpty}</CategoryLine>
        ) : visible.length === 0 ? (
          <CategoryLine>{MONEY_COPY.filterEmpty}</CategoryLine>
        ) : null
      ) : (
        <>
      {items.length === 0 ? (
        <EmptyState
          copy={MONEY_COPY.subscriptionsEmpty}
          action={
            <div className="hidden md:block">
              <MoneyAddButton onClick={() => setAdding(true)}>Add subscription</MoneyAddButton>
            </div>
          }
        />
      ) : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
        </>
      )}
      {visible.map((row) => (
        <MoneyCard key={row.id} id={`item-${row.id}`} onOpen={() => openEdit(row)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <StatusDisc tone={row.active ? "upcoming" : "muted"} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`text-left text-[15px] font-medium ${row.active ? "text-ink" : "text-muted-foreground"}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      openEdit(row)
                    }}
                  >
                    {row.name}
                  </button>
                  <VisibilityPill visibility={row.visibility} />
                  {row.active ? null : (
                    <span className="inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Paused
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                  {amountLabel(row.amount_cents, currency)} · Renews {formatShortDate(row.renews_on)}
                </p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              <RowMenu
                className="max-md:min-h-11 max-md:min-w-11"
                label={row.name}
                visibility={row.visibility}
                onEdit={() => openEdit(row)}
                onVisibility={(visibility) => void changeVisibility(row, visibility)}
                onRemove={() => setRemoving(row)}
                extra={
                  <DropdownMenuItem onSelect={() => void toggleActive(row)}>
                    {row.active ? "Pause" : "Resume"}
                  </DropdownMenuItem>
                }
              />
            </div>
          </div>
        </MoneyCard>
      ))}
      <RecordDialog
        key={adding ? "subscription-add" : "subscription-idle"}
        kind="subscription"
        today={today}
        defaultVisibility="shared"
        sheetOnPhone
        open={adding}
        onOpenChange={setAdding}
      />
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="subscription"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            amount: centsInput(editing.amount_cents),
            date: editing.renews_on,
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this subscription?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteSubscription(removing.id)
          setPendingRemove(false)
          if (!result.ok) {
            toast(result.message)
            return
          }
          setRemoving(null)
          router.refresh()
        }}
      />
    </>
  )

  if (scan) {
    return (
      <MoneyCategoryBlock
        id="money-subscriptions"
        title="Subscriptions"
        subtitle={PHONE_MONEY_COPY.subscriptions}
        addLabel="Add subscription"
        onAdd={() => setAdding(true)}
      >
        {list}
      </MoneyCategoryBlock>
    )
  }

  return (
    <>
    <MoneyFrame
      phoneLayout
      phoneTouch
      phoneSubtitle={PHONE_MONEY_COPY.subscriptions}
      title="Subscriptions"
      subtitle={moneySubtitle("subscriptions", householdName)}
      action={
        <div className="hidden md:block">
          <MoneyAddButton onClick={() => setAdding(true)}>Add subscription</MoneyAddButton>
        </div>
      }
      filter={filter}
      onFilter={setFilter}
      chips={
        <>
          <MetricChip tone={metrics.renewing > 0 ? "brand" : "muted"}>{metrics.renewing} renewing this month</MetricChip>
          <MetricChip>Monthly total {formatMoney(metrics.monthly, currency)}</MetricChip>
        </>
      }
      pulse={<RhythmStrip title="Renewing soon" cells={pulse} empty={MONEY_COPY.subscriptionsPulseEmpty} />}
    >
      {list}
      <PhoneFabClearance />
    </MoneyFrame>
    <LifeFab>
      <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
        Add subscription
      </MoneyAddButton>
    </LifeFab>
    </>
  )
}
