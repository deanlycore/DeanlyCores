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
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { MoneyGroups } from "@/components/money/money-groups"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteGoal, setGoalVisibility } from "@/lib/actions/records"
import type { GoalRow } from "@/lib/data/home"
import { formatMoney } from "@/lib/home/metrics"
import {
  MONEY_COPY,
  PHONE_MONEY_COPY,
  applyVisibility,
  categoryGroupLabel,
  centsInput,
  goalPercent,
  groupMoney,
  moneySubtitle,
  savingsMetrics,
  sortSharedFirst,
} from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export function SavingsBoard({
  rows,
  currency,
  today,
  householdName,
  error,
  scan = false,
  scanFilter,
}: {
  rows: GoalRow[]
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
  const { patch, merge } = useRowPatches<GoalRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GoalRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<GoalRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortSharedFirst(applyVisibility(items, filter))
  const groups = groupMoney(
    "savings",
    visible,
    (goal) => categoryGroupLabel("savings", goal.category),
    () => null,
  )
  const usedCategories = items.map((goal) => goal.category)
  const pulse = visible.slice(0, 4)
  const metrics = savingsMetrics(visible)

  function openEdit(goal: GoalRow) {
    setEditing(goal)
    setEditOpen(true)
  }

  async function changeVisibility(goal: GoalRow, visibility: Visibility) {
    const previous = goal.visibility
    patch(goal.id, { visibility })
    const result = await setGoalVisibility(goal.id, visibility)
    if (!result.ok) {
      patch(goal.id, { visibility: previous })
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
          <CategoryLine>{MONEY_COPY.savingsEmpty}</CategoryLine>
        ) : visible.length === 0 ? (
          <CategoryLine>{MONEY_COPY.filterEmpty}</CategoryLine>
        ) : null
      ) : (
        <>
      {items.length === 0 ? (
        <EmptyState
          copy={MONEY_COPY.savingsEmpty}
          action={
            <div className="hidden md:block">
              <MoneyAddButton onClick={() => setAdding(true)}>Add goal</MoneyAddButton>
            </div>
          }
        />
      ) : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
        </>
      )}
      {visible.length > 0 ? (
        <MoneyGroups section="savings" sectionCount={visible.length} groups={groups} currency={currency} renderRow={(goal) => {
        const percent = goalPercent(goal.current_cents, goal.target_cents)
        return (
          <MoneyCard key={goal.id} id={`item-${goal.id}`} onOpen={() => openEdit(goal)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-left text-[15px] font-medium text-ink"
                    onClick={(event) => {
                      event.stopPropagation()
                      openEdit(goal)
                    }}
                  >
                    {goal.name}
                  </button>
                  <VisibilityPill visibility={goal.visibility} />
                </div>
                <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                  {formatMoney(goal.current_cents, currency)} of {formatMoney(goal.target_cents, currency)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="text-[13px] tabular-nums text-muted-foreground">{percent}%</span>
                </div>
              </div>
              <div onClick={(event) => event.stopPropagation()}>
                <RowMenu
                  className="max-md:min-h-11 max-md:min-w-11"
                  label={goal.name}
                  visibility={goal.visibility}
                  onEdit={() => openEdit(goal)}
                  onVisibility={(visibility) => void changeVisibility(goal, visibility)}
                  onRemove={() => setRemoving(goal)}
                />
              </div>
            </div>
          </MoneyCard>
        )
      }} />
      ) : null}
      <RecordDialog
        key={adding ? "goal-add" : "goal-idle"}
        kind="goal"
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
          kind="goal"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            target: centsInput(editing.target_cents),
            current: centsInput(editing.current_cents),
            visibility: editing.visibility,
            category: editing.category,
          }}
          categories={usedCategories}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this goal?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteGoal(removing.id)
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
        id="money-savings"
        title="Savings"
        subtitle={PHONE_MONEY_COPY.savings}
        addLabel="Add goal"
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
      phoneSubtitle={PHONE_MONEY_COPY.savings}
      title="Savings"
      subtitle={moneySubtitle("savings", householdName)}
      action={
        <div className="hidden md:block">
          <MoneyAddButton onClick={() => setAdding(true)}>Add goal</MoneyAddButton>
        </div>
      }
      filter={filter}
      onFilter={setFilter}
      chips={
        <>
          <MetricChip tone={metrics.onTrack > 0 ? "brand" : "muted"}>{metrics.onTrack} on track</MetricChip>
          <MetricChip>Set aside {formatMoney(metrics.setAside, currency)}</MetricChip>
        </>
      }
      pulse={
        <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
          <h2 className="text-[13px] font-medium text-ink">In progress</h2>
          {pulse.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{MONEY_COPY.savingsPulseEmpty}</p>
          ) : (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
              {pulse.map((goal) => {
                const percent = goalPercent(goal.current_cents, goal.target_cents)
                return (
                  <li key={goal.id} className="min-w-[4.5rem] shrink-0 rounded-[10px] border border-border bg-surface px-3 py-2.5 md:min-w-0 md:shrink">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink">{goal.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{percent}%</p>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                )
              })}
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
        Add goal
      </MoneyAddButton>
    </LifeFab>
    </>
  )
}
