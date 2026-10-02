"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteGoal, setGoalVisibility } from "@/lib/actions/records"
import type { GoalRow } from "@/lib/data/home"
import { formatMoney } from "@/lib/home/metrics"
import {
  MONEY_COPY,
  applyVisibility,
  centsInput,
  goalPercent,
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
}: {
  rows: GoalRow[]
  currency: string
  today: string
  householdName?: string | null
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useMoneyVisibility()
  const { patch, merge } = useRowPatches<GoalRow>()
  const [editing, setEditing] = useState<GoalRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<GoalRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortSharedFirst(applyVisibility(items, filter))
  const pulse = visible.slice(0, 4)
  const metrics = savingsMetrics(visible)

  function addDialog() {
    return (
      <RecordDialog
        kind="goal"
        today={today}
        defaultVisibility="shared"
        trigger={<MoneyAddButton>Add goal</MoneyAddButton>}
      />
    )
  }

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

  return (
    <MoneyFrame
      title="Savings"
      subtitle={moneySubtitle("savings", householdName)}
      action={addDialog()}
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
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {pulse.map((goal) => {
                const percent = goalPercent(goal.current_cents, goal.target_cents)
                return (
                  <li key={goal.id} className="rounded-[10px] border border-border bg-surface px-3 py-2.5">
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
      {error ? <WidgetError /> : null}
      {items.length === 0 ? <EmptyState copy={MONEY_COPY.savingsEmpty} action={addDialog()} /> : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
      {visible.map((goal) => {
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
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div onClick={(event) => event.stopPropagation()}>
                <RowMenu
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
      })}
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="goal"
          today={today}
          defaultVisibility="shared"
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            target: centsInput(editing.target_cents),
            current: centsInput(editing.current_cents),
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
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
    </MoneyFrame>
  )
}
