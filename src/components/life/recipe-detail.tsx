"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecipeForm } from "@/components/life/recipe-form"
import { ConfirmRemove, MoneyAddButton, MoneyCard } from "@/components/money/money-chrome"
import { Button } from "@/components/ui/button"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { addRecipeToShopping, deleteRecipe, loadRecipe, saveRecipe } from "@/lib/actions/recipes"
import { ADDED_JUST_ME, ingredientCategoryLabel, ingredientLine, justMeListLine, planIngredients, planLabel, servingsLabel, type RecipeRow } from "@/lib/life/recipes"
import { calmShoppingMessage } from "@/lib/life/shopping"

export function RecipeDetail({
  recipe,
  shopping,
  pantry,
  error = false,
  canWrite = true,
  preview = false,
  reviewOpen = false,
  addedNotice = "",
  backHref = "/life/recipes",
}: {
  recipe: RecipeRow | null
  shopping: { name: string; checked_at?: string | null }[]
  pantry: { name: string }[]
  error?: boolean
  canWrite?: boolean
  preview?: boolean
  reviewOpen?: boolean
  addedNotice?: string
  backHref?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState<RecipeRow | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [removing, setRemoving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(false)
  const [review, setReview] = useState(reviewOpen)
  const [added, setAdded] = useState<string[] | null>(null)
  const [notice, setNotice] = useState(addedNotice)
  const [pendingAdd, setPendingAdd] = useState(false)
  const batchId = useRef<string | null>(null)
  const adding = useRef(false)
  if (error) {
    return (
      <div className="grid min-w-0 gap-3">
        <Back href={backHref} />
        <WidgetError />
      </div>
    )
  }
  if (!recipe) return null
  const shown = loaded ?? recipe
  const planned = planIngredients(recipe.ingredients, shopping, pantry)
  const toAdd = planned.filter((item) => item.plan === "add")
  const settled = recipe.visibility === "private" && (added !== null || notice === ADDED_JUST_ME)

  return (
    <div className="grid min-w-0 gap-4">
      <Back href={backHref} />
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">{recipe.name}</h1>
          <VisibilityPill visibility={recipe.visibility} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{[recipe.category, servingsLabel(recipe.servings)].filter(Boolean).join(" · ")}</p>
        {canWrite ? null : <p className="mt-2 text-[13px] text-muted-foreground">View-only. You can look, not change recipes.</p>}
      </header>
      {canWrite ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          <MoneyAddButton className="h-11 md:h-10" onClick={() => { setAdded(null); setReview(true) }}>
            Add ingredients to Shopping
          </MoneyAddButton>
          <Button type="button" variant="outline" className="h-11 rounded-button md:h-10" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <button type="button" className="h-11 px-2 text-sm font-medium text-danger md:h-10" onClick={() => setRemoving(true)}>
            Remove
          </button>
        </div>
      ) : null}
      {review ? (
        <section className="grid min-w-0 gap-2" aria-label="Add to Shopping">
          <h2 className="text-[15px] font-medium text-ink">Add to Shopping</h2>
          <p className="text-[13px] text-muted-foreground">Items already on the list or at home stay put.</p>
          {planned.map((item) => (
            <MoneyCard key={item.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink">{ingredientLine(item)}</p>
                  {ingredientCategoryLabel(item.category) ? <p className="text-[13px] text-muted-foreground">{ingredientCategoryLabel(item.category)}</p> : null}
                </div>
                <p className="shrink-0 text-[13px] text-muted-foreground">
                  {settled && (item.plan === "add" || added?.includes(item.name)) ? "On your list" : planLabel(item.plan)}
                </p>
              </div>
            </MoneyCard>
          ))}
          {recipe.visibility === "private" ? (
            <p className="text-sm text-ink">{justMeListLine(settled)}</p>
          ) : notice ? (
            <p className="text-sm text-ink">{notice}</p>
          ) : null}
          {recipe.visibility !== "private" && added ? <p className="text-sm text-ink">{added.length ? `Added ${added.join(", ")}.` : "Nothing new to add."}</p> : null}
          {canWrite && !settled ? (
            <Button
              type="button"
              className="h-11 w-fit rounded-button md:h-10"
              disabled={pendingAdd || toAdd.length === 0}
              onClick={() => {
                if (pendingAdd || adding.current) return
                if (preview) {
                  setAdded(toAdd.map((item) => item.name))
                  if (recipe.visibility === "private") setNotice(ADDED_JUST_ME)
                  return
                }
                batchId.current ??= crypto.randomUUID()
                const requestId = batchId.current
                adding.current = true
                setPendingAdd(true)
                void addRecipeToShopping(recipe.id, requestId).then((result) => {
                  adding.current = false
                  setPendingAdd(false)
                  if (!result.ok) {
                    toast(calmShoppingMessage(result.message))
                    return
                  }
                  batchId.current = null
                  setAdded(result.added ?? [])
                  if (result.message) setNotice(result.message)
                  router.refresh()
                })
              }}
            >
              {pendingAdd ? "Adding…" : toAdd.length === 1 ? "Add 1 item" : `Add ${toAdd.length} items`}
            </Button>
          ) : null}
        </section>
      ) : null}
      <section className="grid min-w-0 gap-2">
        <h2 className="text-[15px] font-medium text-ink">Ingredients</h2>
        {recipe.ingredients.length === 0 ? <p className="text-sm text-muted-foreground">No ingredients yet.</p> : null}
        {recipe.ingredients.map((item) => (
          <MoneyCard key={item.id}>
            <p className="text-[15px] font-medium text-ink">{ingredientLine(item)}</p>
            {ingredientCategoryLabel(item.category) ? <p className="text-[13px] text-muted-foreground">{ingredientCategoryLabel(item.category)}</p> : null}
          </MoneyCard>
        ))}
      </section>
      <section className="grid min-w-0 gap-2">
        <h2 className="text-[15px] font-medium text-ink">Steps</h2>
        {recipe.steps.length === 0 ? <p className="text-sm text-muted-foreground">No steps yet.</p> : null}
        <ol className="grid gap-2">
          {recipe.steps.map((step, index) => (
            <li key={`${index}-${step}`} className="text-sm text-ink">
              {index + 1}. {step}
            </li>
          ))}
        </ol>
      </section>
      {recipe.notes ? (
        <section>
          <h2 className="text-[15px] font-medium text-ink">Notes</h2>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.notes}</p>
        </section>
      ) : null}
      {editing ? (
        <RecipeForm
          key={`${shown.id}-${shown.updated_at}-${formKey}`}
          open
          recipe={shown}
          onOpenChange={setEditing}
          onUseTheirs={() => {
            if (preview) {
              setLoaded(recipe)
              setFormKey((key) => key + 1)
              return
            }
            void loadRecipe(shown.id).then((next) => {
              if (next) setLoaded(next)
              setFormKey((key) => key + 1)
            })
          }}
          onSubmit={async (formData) => {
            if (preview) return { ok: true }
            const result = await saveRecipe(formData)
            if (!result.ok) return result
            router.refresh()
            return result
          }}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={removing}
        title="Remove this recipe?"
        pending={pendingRemove}
        onOpenChange={setRemoving}
        onConfirm={async () => {
          if (preview) {
            setRemoving(false)
            router.push(backHref)
            return
          }
          setPendingRemove(true)
          const result = await deleteRecipe(recipe.id)
          setPendingRemove(false)
          if (!result.ok) {
            toast(calmShoppingMessage(result.message))
            return
          }
          router.push(backHref)
          router.refresh()
        }}
      />
    </div>
  )
}

function Back({ href }: { href: string }) {
  return (
    <Link href={href} className="text-sm font-medium text-brand-deep">
      Recipes
    </Link>
  )
}
