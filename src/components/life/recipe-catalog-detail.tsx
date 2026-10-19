"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { RecipePhoto } from "@/components/life/recipe-photo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { phoneSheetClass } from "@/components/money/money-chrome"
import { addCatalogRecipeToWeek, saveCatalogRecipe } from "@/lib/actions/catalog"
import {
  cardMeta,
  PHOTO_ILLUSTRATION_LINE,
  recipeCatalogImageUrl,
  SAVED_TO_MINE,
  seedPhotoSrc,
  scaledGrams,
  type CatalogRecipe,
} from "@/lib/life/catalog"
import { slotLabel, type MealSlot, SLOTS } from "@/lib/life/planner"
import { cn } from "cn"

export function RecipeCatalogDetail({
  recipe,
  saved = false,
  canWrite = true,
  preview = false,
  supabaseUrl = null,
  base,
  days,
}: {
  recipe: CatalogRecipe
  saved?: boolean
  canWrite?: boolean
  preview?: boolean
  supabaseUrl?: string | null
  base: string
  days: { date: string; label: string }[]
}) {
  const router = useRouter()
  const [isSaved, setSaved] = useState(saved)
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [servings, setServings] = useState(recipe.servings)
  const [day, setDay] = useState(days[0]?.date ?? "")
  const [slot, setSlot] = useState<MealSlot>("dinner")

  async function save() {
    if (!canWrite || isSaved || pending) return
    if (preview) {
      setSaved(true)
      setNotice(SAVED_TO_MINE)
      return
    }
    setPending(true)
    const result = await saveCatalogRecipe(recipe.slug)
    setPending(false)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setSaved(true)
    setNotice(SAVED_TO_MINE)
  }

  async function addToPlan() {
    const chosen = days.find((item) => item.date === day)
    if (!chosen || pending) return
    if (preview) {
      setPlanning(false)
      router.push(`${base}?added=${encodeURIComponent(chosen.label)}`)
      return
    }
    setPending(true)
    const result = await addCatalogRecipeToWeek({
      slug: recipe.slug,
      mealOn: chosen.date,
      slot,
      clientRequestId: crypto.randomUUID(),
    })
    setPending(false)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setSaved(true)
    setPlanning(false)
    router.push(`${base}?added=${encodeURIComponent(result.day)}`)
  }

  return (
    <div className="grid min-w-0 gap-5">
      <Link href={`${base}/browse`} className="inline-flex min-h-12 items-center text-sm font-medium text-brand-deep">
        ‹ Browse
      </Link>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid min-w-0 gap-4">
          <RecipePhoto
            name={recipe.name}
            src={preview ? seedPhotoSrc(recipe.slug) : recipeCatalogImageUrl(recipe.slug, supabaseUrl)}
            variant="detail"
          />
          <header>
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">{recipe.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{cardMeta(recipe)}</p>
          </header>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-12 min-h-12 px-4" disabled={!canWrite || isSaved || pending} onClick={() => void save()}>
              {isSaved ? "Saved" : "Save to my recipes"}
            </Button>
            <Button type="button" variant="outline" className="h-12 min-h-12 px-4" disabled={!canWrite || pending} onClick={() => setPlanning(true)}>
              Add to plan
            </Button>
          </div>
          {notice ? <p className="text-sm text-ink">{notice}</p> : null}
          <section aria-label="Nutrition per serving">
            <h2 className="text-[15px] font-medium text-ink">Nutrition per serving</h2>
            <dl className="mt-2 grid grid-cols-4 gap-2">
              <Nutrition label="Calories" value={String(recipe.kcal)} />
              <Nutrition label="Protein" value={`${recipe.protein} g`} />
              <Nutrition label="Carbs" value={`${recipe.carbs} g`} />
              <Nutrition label="Fat" value={`${recipe.fat} g`} />
            </dl>
          </section>
        </div>
        <div className="grid min-w-0 gap-5">
          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-medium text-ink">Ingredients</h2>
              <div className="flex items-center gap-2" aria-label="Servings">
                <button type="button" className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-surface-muted text-ink" aria-label="Fewer servings" onClick={() => setServings((value) => Math.max(1, value - 1))}>
                  −
                </button>
                <p className="min-w-16 text-center text-sm text-ink">{servings} servings</p>
                <button type="button" className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-surface-muted text-ink" aria-label="More servings" onClick={() => setServings((value) => Math.min(50, value + 1))}>
                  +
                </button>
              </div>
            </div>
            <ul className="grid gap-2">
              {recipe.ingredients.map((item) => {
                const grams = scaledGrams(item.grams, recipe.servings, servings)
                return (
                  <li key={`${item.text}-${item.fdc_id ?? ""}`} className="text-sm text-ink">
                    {item.text}
                    {grams != null ? <span className="text-muted-foreground">{` · ${grams} g`}</span> : null}
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="grid gap-2">
            <h2 className="text-[15px] font-medium text-ink">Steps</h2>
            <ol className="grid gap-2">
              {recipe.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="text-sm text-ink">
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </section>
          <p className="text-[13px] text-muted-foreground">
            {recipe.source}. {recipe.license}. {PHOTO_ILLUSTRATION_LINE}
          </p>
        </div>
      </div>
      <Dialog open={planning} onOpenChange={setPlanning}>
        <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add to plan</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {days.map((item) => (
              <button
                key={item.date}
                type="button"
                aria-pressed={day === item.date}
                className={cn(
                  "min-h-12 rounded-[10px] border px-3 text-left text-sm",
                  day === item.date ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-ink",
                )}
                onClick={() => setDay(item.date)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={slot === item}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-full px-4 text-sm",
                  slot === item ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground",
                )}
                onClick={() => setSlot(item)}
              >
                {slotLabel(item)}
              </button>
            ))}
          </div>
          <Button type="button" className="h-12 min-h-12" disabled={pending || !day} onClick={() => void addToPlan()}>
            Add to plan
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Nutrition({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-2 py-2">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  )
}
