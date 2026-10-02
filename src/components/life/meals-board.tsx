"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { useLifeVisibility, WeekStrip } from "@/components/life/life-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { deleteMeal, setMealVisibility } from "@/lib/actions/records"
import type { MealRow } from "@/lib/data/home"
import { formatShortDate } from "@/lib/home/metrics"
import {
  LIFE_COPY,
  filterLife,
  lifeSubtitle,
  mealCountLabel,
  mealMetrics,
  mealWeekCells,
  sortMeals,
  weekHasMeals,
  weekdayShort,
} from "@/lib/life/board"
import type { Visibility } from "@/lib/visibility"

export function MealsBoard({
  rows,
  today,
  error,
}: {
  rows: MealRow[]
  today: string
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const { patch, merge } = useRowPatches<MealRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MealRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<MealRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortMeals(filterLife(items, filter))
  const metrics = mealMetrics(visible, today)
  const pulse = mealWeekCells(visible, today)

  function clearFilters() {
    setFilter("all")
  }

  async function changeVisibility(meal: MealRow, visibility: Visibility) {
    const previous = meal.visibility
    patch(meal.id, { visibility })
    const result = await setMealVisibility(meal.id, visibility)
    if (!result.ok) {
      patch(meal.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  function openEdit(meal: MealRow) {
    setEditing(meal)
    setEditOpen(true)
  }

  return (
    <MoneyFrame
      phoneTouch
      title="Meals"
      subtitle={lifeSubtitle("meals")}
      filter={filter}
      onFilter={setFilter}
      action={
        <MoneyAddButton className="h-11 md:h-10" onClick={() => setAdding(true)}>
          Add meal
        </MoneyAddButton>
      }
      chips={
        <>
          <MetricChip tone={metrics.cookNights > 0 ? "brand" : "muted"}>
            {mealCountLabel("cook", metrics.cookNights)}
          </MetricChip>
          <MetricChip>{mealCountLabel("leftover", metrics.leftoverNights)}</MetricChip>
        </>
      }
      pulse={
        <WeekStrip
          title="This week · dinners"
          cells={pulse}
          filled={weekHasMeals(visible, today)}
          empty={LIFE_COPY.mealsPulseEmpty}
        />
      }
    >
      {error ? <WidgetError /> : null}
      {items.length === 0 ? (
        <EmptyState copy={LIFE_COPY.mealsEmpty} action={<MoneyAddButton onClick={() => setAdding(true)}>Add meal</MoneyAddButton>} />
      ) : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
      {visible.map((meal) => (
        <MoneyCard key={meal.id} id={`item-${meal.id}`} onOpen={() => openEdit(meal)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-medium text-ink">
                  {weekdayShort(meal.meal_on)} · {meal.title}
                </p>
                <VisibilityPill visibility={meal.visibility} />
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{formatShortDate(meal.meal_on)}</p>
              {meal.notes ? <p className="mt-0.5 text-[13px] text-muted-foreground">{meal.notes}</p> : null}
              {meal.slot !== "dinner" ? <p className="mt-0.5 text-xs capitalize text-muted-foreground">{meal.slot}</p> : null}
            </div>
            <div onClick={(event) => event.stopPropagation()}>
              <RowMenu
                className="max-md:min-h-11 max-md:min-w-11"
                label={meal.title}
                visibility={meal.visibility}
                onEdit={() => openEdit(meal)}
                onVisibility={(visibility) => void changeVisibility(meal, visibility)}
                onRemove={() => setRemoving(meal)}
              />
            </div>
          </div>
        </MoneyCard>
      ))}
      <RecordDialog
        key={adding ? "meal-add" : "meal-idle"}
        kind="meal"
        today={today}
        defaultVisibility="shared"
        sheetOnPhone
        open={adding}
        onOpenChange={setAdding}
      />
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="meal"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            title: editing.title,
            date: editing.meal_on,
            slot: editing.slot,
            notes: editing.notes ?? "",
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this meal?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteMeal(removing.id)
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
