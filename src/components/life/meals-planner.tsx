"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { MealPlannerTabs } from "@/components/life/meal-planner-tabs"

import { useLifeVisibility } from "@/components/life/life-chrome"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { WidgetError } from "@/components/ui/pills"
import { phoneSheetClass, MoneyFrame } from "@/components/money/money-chrome"
import { removePlannedMeal, savePlannedMeal, updateMealList } from "@/lib/actions/meals"
import { filterLife } from "@/lib/life/board"
import {
  confirmListChoice,
  formatWeekLabel,
  mealStatusLine,
  SLOTS,
  slotLabel,
  UPDATE_LIST_CONFIRM,
  updateListButton,
  weekdayLabel,
  weekOf,
  weekShoppingStats,
  type MealSlot,
  type WeekShoppingLine,
} from "@/lib/life/planner"
import { ALREADY_ON_LIST, LIST_ALREADY_HAS_MEAL, STARTER_NOTE } from "@/lib/life/recipes"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

export type PlannerMeal = {
  id: string
  title: string
  meal_on: string
  slot: string
  notes: string | null
  visibility: Visibility
  servings: number
  recipe_id: string | null
  updated_at: string | null
  needed: number
}

export type PlannerRecipe = {
  id: string
  name: string
  servings: number
  visibility: Visibility
  category: string | null
  minutes: number | null
  atHome: number
  onList: number
  need: number
  ingredientCount: number
  costCents: number | null
}

export function MealsPlanner({
  meals,
  recipes,
  today,
  canWrite = true,
  error = false,
  preview = false,
  initialSheet = null,
  shoppingLines = [],
  showTabs = false,
  addedDay = null,
  browseHref = "/life/meal-planner/browse",
  tabBase = "/life/meal-planner",
}: {
  meals: PlannerMeal[]
  recipes: PlannerRecipe[]
  today: string
  canWrite?: boolean
  error?: boolean
  preview?: boolean
  initialSheet?: "detail" | "confirm" | "already" | null
  shoppingLines?: WeekShoppingLine[]
  showTabs?: boolean
  addedDay?: string | null
  browseHref?: string
  tabBase?: string
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const [offset, setOffset] = useState(0)
  const [useWhatWeHave, setUseWhatWeHave] = useState(false)
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(initialSheet ? meals.find((meal) => meal.recipe_id)?.id ?? meals[0]?.id ?? null : null)
  const [confirm, setConfirm] = useState(initialSheet === "confirm")
  const [notice, setNotice] = useState(initialSheet === "already" ? LIST_ALREADY_HAS_MEAL : "")
  const [pending, setPending] = useState(false)
  const [picker, setPicker] = useState<{ day: string; slot: MealSlot } | null>(null)
  const [clientRequestId, setClientRequestId] = useState<string | null>(null)
  const [placed, setPlaced] = useState<PlannerMeal[]>([])
  const [query, setQuery] = useState("")
  const [chip, setChip] = useState<string>("all")
  const week = weekOf(today, offset)
  const plannedMeals = [...meals, ...placed.filter((meal) => !meals.some((row) => row.id === meal.id))]
  const visible = filterLife(plannedMeals, filter).filter((meal) => meal.meal_on >= week.start && meal.meal_on <= week.end)
  const selected = plannedMeals.find((meal) => meal.id === selectedId) ?? null
  const listAction = selected ? updateListButton({ recipeId: selected.recipe_id }, canWrite) : "hidden"
  const alreadyOnList = notice === LIST_ALREADY_HAS_MEAL
  const plannedCount = visible.length
  const stats = weekShoppingStats(
    visible.map((meal) => meal.id),
    shoppingLines,
  )
  const recent = useMemo(() => recipes.slice(0, 6), [recipes])
  const searched = recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase()))

  function dayOpen(day: string) {
    if (day in openDays) return openDays[day]
    return day === today
  }

  async function runUpdate() {
    if (!selected?.recipe_id || !canWrite) return
    if (preview) {
      setConfirm(false)
      setNotice(LIST_ALREADY_HAS_MEAL)
      return
    }
    setPending(true)
    const result = await updateMealList(selected.id)
    setPending(false)
    setConfirm(false)
    if (!result.ok) {
      toast(result.message)
      return
    }
    setNotice(result.message ?? "List updated.")
    router.refresh()
  }

  function openAdd(day: string, slot: MealSlot) {
    setClientRequestId(crypto.randomUUID())
    setPicker({ day, slot })
  }

  function placeRecipe(recipe: PlannerRecipe) {
    const slot = picker
    const requestId = clientRequestId
    setPicker(null)
    if (!slot || !requestId) return
    const meal: PlannerMeal = {
      id: requestId,
      title: recipe.name,
      meal_on: slot.day,
      slot: slot.slot,
      notes: null,
      visibility: recipe.visibility,
      servings: recipe.servings,
      recipe_id: recipe.id,
      updated_at: null,
      needed: recipe.need,
    }
    if (preview) {
      setPlaced((current) => [...current, meal])
      setSelectedId(meal.id)
      setConfirm(Boolean(recipe.id))
      return
    }
    void savePlannedMeal({
      title: recipe.name,
      mealOn: slot.day,
      slot: slot.slot,
      servings: recipe.servings,
      visibility: recipe.visibility,
      recipeId: recipe.id,
      clientRequestId: requestId,
    }).then((result) => {
      if (!result.ok) {
        toast(result.message)
        return
      }
      const saved = { ...meal, id: result.id ?? requestId }
      setPlaced((current) => [...current, saved])
      setSelectedId(saved.id)
      setConfirm(Boolean(recipe.id))
      router.refresh()
    })
  }

  function declineUpdate() {
    const writes = confirmListChoice("not-now", [])
    setConfirm(false)
    if (writes.includes("sync")) void runUpdate()
  }

  return (
    <MoneyFrame
      phoneTouch
      title="Meal Planner"
      subtitle=""
      action={null}
      chips={null}
      pulse={null}
      filter={filter}
      onFilter={setFilter}
      afterHeader={showTabs ? <MealPlannerTabs base={tabBase} current="week" /> : null}
    >
      {addedDay ? <p className="text-sm text-ink">{`Added to ${addedDay}.`}</p> : null}
      {error ? <WidgetError /> : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Planned" value={`${plannedCount} meal${plannedCount === 1 ? "" : "s"}`} />
        <Tile label="Still needed" value={`${stats.stillNeeded} item${stats.stillNeeded === 1 ? "" : "s"}`} />
        <Tile label="Bought" value={stats.boughtLabel} />
        <Tile label="Estimated" value={stats.estimate} />
      </div>
      <button
        type="button"
        aria-pressed={useWhatWeHave}
        onClick={() => setUseWhatWeHave((open) => !open)}
        className={cn(
          "inline-flex min-h-12 w-fit items-center rounded-full border px-4 text-sm",
          useWhatWeHave ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
        )}
      >
        Use what we have
      </button>
      {useWhatWeHave ? (
        <UseWhatWeHave recipes={recipes} chip={chip} onChip={setChip} emptyPantry={recipes.every((recipe) => recipe.atHome === 0)} />
      ) : null}
      <section className="grid min-w-0 gap-3" aria-label="This week">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="inline-flex min-h-12 min-w-12 items-center justify-center text-muted-foreground" aria-label="Previous week" onClick={() => setOffset((value) => value - 1)}>
              ‹
            </button>
            <p className="text-sm text-ink">{formatWeekLabel(week.start)}</p>
            <button type="button" className="inline-flex min-h-12 min-w-12 items-center justify-center text-muted-foreground" aria-label="Next week" onClick={() => setOffset((value) => value + 1)}>
              ›
            </button>
          </div>
          <div className="hidden md:grid md:grid-cols-7 md:gap-2">
            {week.days.map((day) => {
              const dayMeals = visible.filter((meal) => meal.meal_on === day)
              return (
                <div key={day} className={cn("rounded-[12px] border border-border p-2", day === today && "bg-surface-muted")}>
                  <p className="text-[13px] text-ink">{weekdayLabel(day)}</p>
                  {dayMeals.length === 0 ? (
                    <button type="button" className="min-h-12 text-left text-[13px] text-muted-foreground" onClick={() => openAdd(day, "dinner")}>
                      + Add
                    </button>
                  ) : (
                    <SlotColumn
                      day={day}
                      meals={visible}
                      onOpen={setSelectedId}
                      onAdd={(slot) => openAdd(day, slot)}
                    />
                  )}
                  {dayMeals.length === 0 ? (
                    <Link href={browseHref} className="inline-flex min-h-12 items-center text-[13px] font-medium text-brand-deep">
                      Find a recipe
                    </Link>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="grid gap-2 md:hidden">
            {week.days.map((day) => {
              const count = visible.filter((meal) => meal.meal_on === day).length
              const needed = visible.filter((meal) => meal.meal_on === day).reduce((sum, meal) => sum + meal.needed, 0)
              const open = dayOpen(day)
              return (
                <div key={day} className="rounded-[12px] border border-border">
                  <button type="button" className="flex min-h-12 w-full items-center px-3 text-left text-sm text-ink" onClick={() => setOpenDays((current) => ({ ...current, [day]: !open }))}>
                    {open ? weekdayLabel(day) : `${weekdayLabel(day)} · ${count} meal${count === 1 ? "" : "s"} · ${needed} item${needed === 1 ? "" : "s"} needed`}
                  </button>
                  {count === 0 ? (
                    <div className="px-3 pb-3">
                      <Link href={browseHref} className="inline-flex min-h-12 items-center text-[13px] font-medium text-brand-deep">
                        Find a recipe
                      </Link>
                    </div>
                  ) : null}
                  {open ? (
                    <div className="grid gap-2 px-3 pb-3">
                      <SlotColumn
                        day={day}
                        meals={visible}
                        onOpen={setSelectedId}
                        onAdd={(slot) => openAdd(day, slot)}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelectedId(null); setConfirm(false); setNotice("") } }}>
        <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-3">
              <p className="text-[13px] text-muted-foreground">Servings</p>
              <p className="text-sm text-ink">{selected.servings}</p>
              {listAction === "hidden" || confirm ? null : alreadyOnList ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-lg bg-surface-muted px-3 text-sm font-medium text-muted-foreground opacity-60"
                >
                  {ALREADY_ON_LIST}
                </button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full"
                  disabled={pending || listAction === "disabled"}
                  onClick={() => setConfirm(true)}
                >
                  {pending ? "Updating…" : "Update list"}
                </Button>
              )}
              {notice ? <p className="text-[13px] text-muted-foreground">{notice}</p> : null}
              {confirm ? (
                <div className="grid gap-2 rounded-[12px] border border-border bg-surface-muted p-3">
                  <p className="text-sm text-ink">{UPDATE_LIST_CONFIRM}</p>
                  <Button type="button" className="min-h-12" disabled={pending} onClick={() => void runUpdate()}>
                    Update list
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    onClick={declineUpdate}
                  >
                    Not now
                  </Button>
                </div>
              ) : null}
              <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => void removeMeal(selected, preview, router)}>
                Remove from plan
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(picker)} onOpenChange={(open) => { if (!open) { setPicker(null); setClientRequestId(null) } }}>
        <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add</DialogTitle>
          </DialogHeader>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search recipes" className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink" />
          <p className="text-[13px] text-muted-foreground">Recent</p>
          <div className="grid gap-2">
            {(query.trim() ? searched : recent).map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="min-h-12 rounded-[10px] border border-border px-3 text-left text-sm text-ink"
                onClick={() => placeRecipe(recipe)}
              >
                {recipe.name}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-muted-foreground">{STARTER_NOTE}</p>
        </DialogContent>
      </Dialog>
    </MoneyFrame>
  )
}

async function removeMeal(meal: PlannerMeal, preview: boolean, router: { refresh: () => void }) {
  if (preview || !meal.updated_at) return
  const result = await removePlannedMeal(meal.id, meal.updated_at)
  if (!result.ok) toast(result.message)
  else router.refresh()
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-3 py-2">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-medium text-ink">{value}</p>
    </div>
  )
}

function SlotColumn({
  day,
  meals,
  onOpen,
  onAdd,
}: {
  day: string
  meals: PlannerMeal[]
  onOpen: (id: string) => void
  onAdd: (slot: MealSlot) => void
}) {
  return (
    <div className="grid gap-2">
      {SLOTS.map((slot) => {
        const rows = meals.filter((meal) => meal.meal_on === day && meal.slot === slot)
        return (
          <div key={slot} className="grid gap-1">
            <p className="text-[12px] text-muted-foreground">{slotLabel(slot)}</p>
            {rows.map((meal) => (
              <div key={meal.id} className="rounded-[10px] border border-border bg-surface px-2 py-2">
                <button type="button" className="min-h-12 w-full text-left" onClick={() => onOpen(meal.id)}>
                  <p className="text-sm text-ink">{meal.title}</p>
                  {mealStatusLine(meal.servings, meal.needed, Boolean(meal.recipe_id)) ? (
                    <p className="text-[13px] text-muted-foreground">{mealStatusLine(meal.servings, meal.needed, Boolean(meal.recipe_id))}</p>
                  ) : null}
                </button>
              </div>
            ))}
            <button type="button" className="min-h-12 text-left text-[13px] text-muted-foreground" onClick={() => onAdd(slot)}>
              + Add
            </button>
          </div>
        )
      })}
    </div>
  )
}

function UseWhatWeHave({
  recipes,
  chip,
  onChip,
  emptyPantry,
}: {
  recipes: PlannerRecipe[]
  chip: string
  onChip: (chip: string) => void
  emptyPantry: boolean
}) {
  const chips = ["Mostly at home", "On my list", "Fewest more", "Quick (30 min or less)", "Lowest cost"]
  let shown = recipes.slice()
  if (chip === "Mostly at home") shown = shown.filter((recipe) => recipe.ingredientCount > 0 && recipe.atHome / recipe.ingredientCount >= 0.5)
  if (chip === "On my list") shown = shown.filter((recipe) => recipe.onList > 0)
  if (chip === "Fewest more") shown = shown.sort((a, b) => a.need - b.need)
  if (chip === "Quick (30 min or less)") shown = shown.filter((recipe) => recipe.minutes != null && recipe.minutes <= 30)
  if (chip === "Lowest cost") shown = shown.sort((a, b) => (a.costCents ?? Number.MAX_SAFE_INTEGER) - (b.costCents ?? Number.MAX_SAFE_INTEGER))
  return (
    <section className="grid gap-3" aria-label="Use what we have">
      <div className="flex gap-2 overflow-x-auto">
        {chips.map((label) => (
          <button key={label} type="button" aria-pressed={chip === label} onClick={() => onChip(chip === label ? "all" : label)} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px]", chip === label ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {emptyPantry && chip === "Mostly at home" ? <p className="text-sm text-muted-foreground">Mark what’s at home in Shopping to see ideas here.</p> : null}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No recipes match these filters.</p> : null}
      {shown.map((recipe) => (
        <article key={recipe.id} className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <p className="text-[15px] font-medium text-ink">{recipe.name}</p>
          <p className="text-[13px] text-muted-foreground">{[recipe.minutes ? `${recipe.minutes} min` : null, `${recipe.servings} servings`].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{`Uses ${recipe.atHome + recipe.onList} of ${recipe.ingredientCount} ingredients. ${recipe.need} more needed.`}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
            <span className="text-ink">At home</span>
            <span className="text-muted-foreground">On list</span>
            <span className="text-muted-foreground">Need</span>
          </div>
        </article>
      ))}
    </section>
  )
}
