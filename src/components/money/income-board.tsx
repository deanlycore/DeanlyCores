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
  RowMenu,
  StatusDisc,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { MoneyGroups } from "@/components/money/money-groups"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteExpense, setExpenseVisibility } from "@/lib/actions/records"
import type { ExpenseRow } from "@/lib/data/home"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import {
  MONEY_COPY,
  PHONE_MONEY_COPY,
  applyVisibility,
  categoryGroupLabel,
  centsInput,
  groupMoney,
  incomeGap,
  incomeGroupTotal,
  incomeMetrics,
  moneySubtitle,
  nextPayEvents,
  sortIncome,
} from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export function IncomeBoard({
  rows,
  currency,
  today,
  householdName,
  error,
  scan = false,
  scanFilter,
}: {
  rows: ExpenseRow[]
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
  const { patch, merge } = useRowPatches<ExpenseRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<ExpenseRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortIncome(applyVisibility(items, filter), today)
  const groups = groupMoney(
    "income",
    visible,
    (row) => categoryGroupLabel("income", row.category),
    (rows) => incomeGroupTotal(rows, today),
  )
  const usedCategories = items.map((row) => row.category)
  const metrics = incomeMetrics(visible, today)
  const upcoming = nextPayEvents(visible, today)

  function openEdit(row: ExpenseRow) {
    setEditing(row)
    setEditOpen(true)
  }

  async function changeVisibility(row: ExpenseRow, visibility: Visibility) {
    const previous = row.visibility
    patch(row.id, { visibility })
    const result = await setExpenseVisibility(row.id, visibility)
    if (!result.ok) {
      patch(row.id, { visibility: previous })
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
          <CategoryLine>{MONEY_COPY.incomeEmpty}</CategoryLine>
        ) : visible.length === 0 ? (
          <CategoryLine>{MONEY_COPY.filterEmpty}</CategoryLine>
        ) : null
      ) : (
        <>
      {items.length === 0 ? (
        <EmptyState
          copy={MONEY_COPY.incomeEmpty}
          action={
            <div className="hidden md:block">
              <MoneyAddButton onClick={() => setAdding(true)}>Add income</MoneyAddButton>
            </div>
          }
        />
      ) : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
        </>
      )}
      {visible.length > 0 ? (
        <MoneyGroups section="income" sectionCount={visible.length} groups={groups} currency={currency} renderRow={(row) => {
        const expected = row.spent_on > today
        const gap = incomeGap(row, visible, today)
        return (
          <MoneyCard key={row.id} id={`item-${row.id}`} onOpen={() => openEdit(row)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <StatusDisc tone={expected ? "upcoming" : "paid"} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-left text-[15px] font-medium text-ink"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEdit(row)
                      }}
                    >
                      {row.name}
                    </button>
                    <VisibilityPill visibility={row.visibility} />
                  </div>
                  <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                    {formatMoney(row.amount_cents, currency)} · {formatShortDate(row.spent_on)}
                  </p>
                  {gap ? <p className="mt-1 text-xs text-warn">{gap}</p> : null}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <p className={expected ? "text-[13px] text-muted-foreground" : "text-[13px] text-success"}>
                  {expected ? "Expected" : "Received"}
                </p>
                <RowMenu
                  className="max-md:min-h-11 max-md:min-w-11"
                  label={row.name}
                  visibility={row.visibility}
                  onEdit={() => openEdit(row)}
                  onVisibility={(visibility) => void changeVisibility(row, visibility)}
                  onRemove={() => setRemoving(row)}
                />
              </div>
            </div>
          </MoneyCard>
        )
      }} />
      ) : null}
      <RecordDialog
        key={adding ? "income-add" : "income-idle"}
        kind="income"
        today={today}
        defaultVisibility="shared"
        sheetOnPhone
        categories={usedCategories}
        open={adding}
        onOpenChange={setAdding}
      />
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="income"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            amount: centsInput(editing.amount_cents),
            date: editing.spent_on,
            visibility: editing.visibility,
            category: editing.category,
          }}
          categories={usedCategories}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this income?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteExpense(removing.id)
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
        id="money-income"
        title="Income"
        subtitle={PHONE_MONEY_COPY.income}
        addLabel="Add income"
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
      phoneSubtitle={PHONE_MONEY_COPY.income}
      title="Income"
      subtitle={moneySubtitle("income", householdName)}
      action={
        <div className="hidden md:block">
          <MoneyAddButton onClick={() => setAdding(true)}>Add income</MoneyAddButton>
        </div>
      }
      filter={filter}
      onFilter={setFilter}
      chips={
        <>
          <MetricChip tone={metrics.nextDate ? "brand" : "muted"}>
            {metrics.nextDate ? `Next pay ${formatShortDate(metrics.nextDate)}` : "No payday yet"}
          </MetricChip>
          <MetricChip>This month {formatMoney(metrics.monthCents, currency)}</MetricChip>
        </>
      }
      pulse={
        <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
          <h2 className="text-[13px] font-medium text-ink">Next payday</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{MONEY_COPY.incomePulseEmpty}</p>
          ) : (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
              {upcoming.map((row) => (
                <li key={row.id} className="min-w-[4.5rem] shrink-0 rounded-[10px] bg-brand-soft px-3 py-3 text-on-brand-soft md:min-w-0">
                  <p className="text-[13px] tabular-nums">{formatShortDate(row.spent_on)}</p>
                  <p className="mt-1 text-[15px] font-medium">{row.name}</p>
                  <p className="text-[13px] tabular-nums">{formatMoney(row.amount_cents, currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    >
      {list}
      <PhoneFabClearance />
    </MoneyFrame>
    <LifeFab>
      <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
        Add income
      </MoneyAddButton>
    </LifeFab>
    </>
  )
}
