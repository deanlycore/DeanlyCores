"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
  type MealSlot,
} from "@/lib/life/planner"
import { LIST_ALREADY_HAS_MEAL, STARTER_NOTE } from "@/lib/life/recipes"
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
  estimate,
  stillNeeded,
  boughtLabel,
}: {
  meals: PlannerMeal[]
  recipes: PlannerRecipe[]
  today: string
  canWrite?: boolean
  error?: boolean
  preview?: boolean
  initialSheet?: "detail" | "confirm" | "already" | null
  estimate: string
  stillNeeded: number
  boughtLabel: string
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const [offset, setOffset] = useState(0)
  const [tab, setTab] = useState<"week" | "pantry" | "recipes">("week")
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(initialSheet ? meals.find((meal) => meal.recipe_id)?.id ?? meals[0]?.id ?? null : null)
  const [confirm, setConfirm] = useState(initialSheet === "confirm")
  const [notice, setNotice] = useState(initialSheet === "already" ? LIST_ALREADY_HAS_MEAL : "")
  const [pending, setPending] = useState(false)
  const [picker, setPicker] = useState<{ day: string; slot: MealSlot } | null>(null)
  const [query, setQuery] = useState("")
  const [chip, setChip] = useState<string>("all")
  const [menuId, setMenuId] = useState<string | null>(null)
  const week = weekOf(today, offset)
  const visible = filterLife(meals, filter).filter((meal) => meal.meal_on >= week.start && meal.meal_on <= week.end)
  const selected = meals.find((meal) => meal.id === selectedId) ?? null
  const listAction = selected ? updateListButton({ recipeId: selected.recipe_id }, canWrite) : "hidden"
  const plannedCount = visible.length
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

  function declineUpdate() {
    const writes = confirmListChoice("not-now", [])
    setConfirm(false)
    if (writes.includes("sync")) void runUpdate()
  }

  return (
    <MoneyFrame phoneTouch title="Meals" subtitle="" action={null} chips={null} pulse={null} filter={filter} onFilter={setFilter}>
      {error ? <WidgetError /> : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Planned" value={`${plannedCount} meal${plannedCount === 1 ? "" : "s"}`} />
        <Tile label="Still needed" value={`${stillNeeded} item${stillNeeded === 1 ? "" : "s"}`} />
        <Tile label="Bought" value={boughtLabel} />
        <Tile label="Estimated" value={estimate} />
      </div>
      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {(
          [
            ["week", "This week"],
            ["pantry", "Use what we have"],
            ["recipes", "Recipes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-[13px]",
              tab === id ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "week" ? (
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
            {week.days.map((day) => (
              <div key={day} className={cn("rounded-[12px] border border-border p-2", day === today && "bg-surface-muted")}>
                <p className="text-[13px] text-ink">{weekdayLabel(day)}</p>
                <SlotColumn
                  day={day}
                  meals={visible}
                  menuId={menuId}
                  onMenu={setMenuId}
                  onOpen={setSelectedId}
                  onAdd={(slot) => setPicker({ day, slot })}
                  onAskConfirm={() => setConfirm(true)}
                />
              </div>
            ))}
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
                  {open ? (
                    <div className="grid gap-2 px-3 pb-3">
                      <SlotColumn
                        day={day}
                        meals={visible}
                        menuId={menuId}
                        onMenu={setMenuId}
                        onOpen={setSelectedId}
                        onAdd={(slot) => setPicker({ day, slot })}
                        onAskConfirm={() => {
                          setSelectedId(visible.find((meal) => meal.meal_on === day)?.id ?? selectedId)
                          setConfirm(true)
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
      {tab === "pantry" ? (
        <UseWhatWeHave recipes={recipes} chip={chip} onChip={setChip} emptyPantry={recipes.every((recipe) => recipe.atHome === 0)} />
      ) : null}
      {tab === "recipes" ? (
        <div className="grid gap-2">
          {recipes.length === 0 ? <p className="text-sm text-muted-foreground">No recipes yet.</p> : null}
          {recipes.map((recipe) => (
            <div key={recipe.id} className="rounded-[12px] border border-border bg-surface px-3 py-3">
              <p className="text-[15px] font-medium text-ink">{recipe.name}</p>
              <p className="text-[13px] text-muted-foreground">{[recipe.minutes ? `${recipe.minutes} min` : null, `${recipe.servings} servings`].filter(Boolean).join(" · ")}</p>
            </div>
          ))}
        </div>
      ) : null}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelectedId(null); setConfirm(false); setNotice("") } }}>
        <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-3">
              <p className="text-[13px] text-muted-foreground">Servings</p>
              <p className="text-sm text-ink">{selected.servings}</p>
              {listAction === "hidden" ? null : (
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
              <button type="button" className="justify-self-start text-left text-sm text-muted-foreground" onClick={() => void removeMeal(selected, preview, router)}>
                Remove from plan
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(picker)} onOpenChange={(open) => { if (!open) setPicker(null) }}>
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
                onClick={() => {
                  const slot = picker
                  setPicker(null)
                  if (!slot || preview) return
                  void savePlannedMeal({
                    title: recipe.name,
                    mealOn: slot.day,
                    slot: slot.slot,
                    servings: recipe.servings,
                    visibility: recipe.visibility,
                    recipeId: recipe.id,
                  }).then((result) => {
                    if (!result.ok) toast(result.message)
                    else router.refresh()
                  })
                }}
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
  menuId,
  onMenu,
  onOpen,
  onAdd,
  onAskConfirm,
}: {
  day: string
  meals: PlannerMeal[]
  menuId: string | null
  onMenu: (id: string | null) => void
  onOpen: (id: string) => void
  onAdd: (slot: MealSlot) => void
  onAskConfirm: () => void
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
                <button type="button" className="text-[13px] text-muted-foreground" aria-label={`${meal.title} menu`} onClick={() => onMenu(menuId === meal.id ? null : meal.id)}>
                  ···
                </button>
                {menuId === meal.id ? (
                  <div className="grid gap-1 pt-1">
                    {["Change servings", "Replace", "Move to…", "Duplicate", "Remove"].map((label) => (
                      <button key={label} type="button" className="min-h-12 text-left text-[13px] text-ink" onClick={onAskConfirm}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
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
          <button type="button" className="mt-2 min-h-12 text-[13px] text-ink">
            Add to week
          </button>
        </article>
      ))}
    </section>
  )
}
