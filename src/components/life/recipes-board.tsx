"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecipeForm } from "@/components/life/recipe-form"
import { useLifeVisibility } from "@/components/life/life-chrome"
import { ConfirmRemove, EmptyState, FilterEmpty, MetricChip, MoneyAddButton, MoneyCard, MoneyFrame, phoneSheetClass } from "@/components/money/money-chrome"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { copyCatalogRecipe, deleteRecipe, loadRecipe, saveRecipe } from "@/lib/actions/recipes"
import { filterLife, LIFE_COPY, lifeSubtitle } from "@/lib/life/board"
import { ingredientLine, OTHERS_ADDED, RECIPE_STALE, servingsLabel, STARTER_NOTE, type RecipeRow, type StarterRecipe } from "@/lib/life/recipes"
import { calmShoppingMessage } from "@/lib/life/shopping"

export function RecipesBoard({
  rows,
  starters,
  error = false,
  canWrite = true,
  preview = false,
  hrefBase = "/life/recipes",
  staleOpen = false,
  blockedOpen = false,
  starterOpen = false,
}: {
  rows: RecipeRow[]
  starters: StarterRecipe[]
  error?: boolean
  canWrite?: boolean
  preview?: boolean
  hrefBase?: string
  staleOpen?: boolean
  blockedOpen?: boolean
  starterOpen?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const [library, setLibrary] = useState(rows)
  const [catalog, setCatalog] = useState(starters)
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<RecipeRow | null>(() => (staleOpen || blockedOpen ? rows.find((recipe) => recipe.visibility === "shared") ?? rows[0] ?? null : null))
  const [previewing, setPreviewing] = useState<StarterRecipe | null>(() => (starterOpen ? starters[0] ?? null : null))
  const [formKey, setFormKey] = useState(0)
  const [removing, setRemoving] = useState<RecipeRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  const visible = filterLife(library, filter).filter((recipe) => matches(recipe, query))
  const visibleStarters = catalog.filter((recipe) => matches(recipe, query) && (filter === "all" || filter === "shared"))

  async function submit(formData: FormData) {
    if (preview) {
      if (staleOpen && formData.get("id") && formData.get("keep_mine") !== "1") {
        return { ok: false as const, message: RECIPE_STALE, conflict: true as const }
      }
      const name = String(formData.get("name") ?? "Recipe")
      const id = String(formData.get("id") ?? `local-${library.length + 1}`)
      const next: RecipeRow = {
        id,
        name,
        category: String(formData.get("category") ?? "") || null,
        servings: Number(formData.get("servings") ?? 4),
        steps: String(formData.get("steps") ?? "").split("\n").map((step) => step.trim()).filter(Boolean),
        notes: String(formData.get("notes") ?? "") || null,
        visibility: formData.get("visibility") === "private" ? "private" : "shared",
        catalog_recipe_id: null,
        created_by: "preview",
        updated_at: "",
        ingredients: [],
      }
      setLibrary((current) => {
        const index = current.findIndex((recipe) => recipe.id === id)
        if (index === -1) return [next, ...current]
        return current.map((recipe) => (recipe.id === id ? { ...recipe, ...next, ingredients: recipe.ingredients } : recipe))
      })
      return { ok: true as const }
    }
    const result = await saveRecipe(formData)
    if (!result.ok) return result
    router.refresh()
    return result
  }

  async function copyStarter(starter: StarterRecipe) {
    if (!canWrite) return
    if (preview) {
      const id = `copy-${starter.id}`
      setLibrary((current) => [
        {
          id,
          name: starter.name,
          category: starter.category,
          servings: starter.servings,
          steps: starter.steps,
          notes: starter.notes,
          visibility: "shared",
          catalog_recipe_id: starter.id,
          created_by: "preview",
          updated_at: "",
          ingredients: starter.ingredients,
        },
        ...current,
      ])
      setCatalog((current) => current.map((item) => (item.id === starter.id ? { ...item, copiedId: id } : item)))
      return
    }
    const result = await copyCatalogRecipe(starter.id, "shared")
    if (!result.ok) {
      toast(calmShoppingMessage(result.message))
      return
    }
    router.refresh()
  }

  function replaceEditing(next: RecipeRow) {
    setEditing(next)
    setFormKey((key) => key + 1)
  }

  return (
    <>
      <MoneyFrame
        phoneTouch
        title="Recipes"
        subtitle={lifeSubtitle("recipes")}
        filter={filter}
        onFilter={setFilter}
        action={
          canWrite ? (
            <MoneyAddButton className="h-11 md:h-10" onClick={() => setAdding(true)}>
              Add recipe
            </MoneyAddButton>
          ) : null
        }
        chips={
          <>
            <MetricChip tone={visible.length > 0 ? "brand" : "muted"}>{`${visible.length} recipe${visible.length === 1 ? "" : "s"}`}</MetricChip>
            <MetricChip>{`${visibleStarters.length} starter${visibleStarters.length === 1 ? "" : "s"}`}</MetricChip>
          </>
        }
        pulse={
          <div className="grid min-w-0 gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes"
              aria-label="Search recipes"
              className="h-10 min-w-0 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink"
            />
            {canWrite ? null : <p className="text-[13px] text-muted-foreground">View-only. You can look, not change recipes.</p>}
          </div>
        }
      >
        {error ? <WidgetError /> : null}
        {!error && library.length === 0 ? (
          <EmptyState
            copy={LIFE_COPY.recipesEmpty}
            action={canWrite ? <MoneyAddButton onClick={() => setAdding(true)}>Add recipe</MoneyAddButton> : <span />}
          />
        ) : null}
        {!error && library.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => { setFilter("all"); setQuery("") }} /> : null}
        {visible.map((recipe) => (
          <MoneyCard key={recipe.id}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <Link href={`${hrefBase}/${recipe.id}`} className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-medium text-ink">{recipe.name}</p>
                  <VisibilityPill visibility={recipe.visibility} />
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {[recipe.category, servingsLabel(recipe.servings)].filter(Boolean).join(" · ")}
                </p>
                {recipe.ingredients[0] ? <p className="mt-0.5 text-[13px] text-muted-foreground">{ingredientLine(recipe.ingredients[0])}</p> : null}
              </Link>
              {canWrite ? (
                <div className="flex shrink-0 gap-3 pt-1">
                  <button type="button" className="text-[13px] font-medium text-brand-deep" onClick={() => setEditing(recipe)}>
                    Edit
                  </button>
                  <button type="button" className="text-[13px] font-medium text-danger" onClick={() => setRemoving(recipe)}>
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          </MoneyCard>
        ))}
        {visibleStarters.length > 0 ? <h2 className="px-1 pt-2 text-[13px] font-medium text-muted-foreground">Starters</h2> : null}
        {visibleStarters.map((starter) => (
          <MoneyCard key={starter.id}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <button type="button" className="min-w-0 text-left" onClick={() => setPreviewing(starter)}>
                <p className="text-[15px] font-medium text-ink">{starter.name}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {[starter.category, servingsLabel(starter.servings), "Starter"].filter(Boolean).join(" · ")}
                </p>
              </button>
              {canWrite && !starter.copiedId ? (
                <button type="button" className="text-[13px] font-medium text-brand-deep" onClick={() => setPreviewing(starter)}>
                  Preview
                </button>
              ) : null}
              {starter.copiedId ? (
                <Link href={`${hrefBase}/${starter.copiedId}`} className="text-[13px] font-medium text-brand-deep">
                  In your recipes
                </Link>
              ) : null}
            </div>
          </MoneyCard>
        ))}
      </MoneyFrame>
      {canWrite ? (
        <RecipeForm key={adding ? "add" : "idle"} open={adding} recipe={null} onOpenChange={setAdding} onSubmit={submit} />
      ) : null}
      {editing ? (
        <RecipeForm
          key={`${editing.id}-${formKey}`}
          open
          recipe={editing}
          showConflict={staleOpen && formKey === 0}
          initialNote={blockedOpen && formKey === 0 ? OTHERS_ADDED : ""}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onUseTheirs={() => {
            const current = editing
            if (preview) {
              const next = library.find((recipe) => recipe.id === current.id) ?? current
              replaceEditing(next)
              return
            }
            void loadRecipe(current.id).then((next) => {
              if (next) replaceEditing(next)
            })
          }}
          onSubmit={submit}
        />
      ) : null}
      <Dialog open={Boolean(previewing)} onOpenChange={(open) => { if (!open) setPreviewing(null) }}>
        <DialogContent className={phoneSheetClass}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{previewing?.name}</DialogTitle>
          </DialogHeader>
          {previewing ? (
            <div className="grid gap-3">
              <p className="text-[13px] text-muted-foreground">{STARTER_NOTE}</p>
              <p className="text-sm text-ink">{[previewing.category, servingsLabel(previewing.servings)].filter(Boolean).join(" · ")}</p>
              {previewing.ingredients.map((item) => (
                <p key={item.id} className="text-sm text-ink">{ingredientLine(item)}</p>
              ))}
              {previewing.steps.map((step) => (
                <p key={step} className="text-sm text-muted-foreground">{step}</p>
              ))}
              {canWrite && !previewing.copiedId ? (
                <Button type="button" className="min-h-12" onClick={() => void copyStarter(previewing)}>
                  Add to your recipes
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this recipe?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          if (preview) {
            setLibrary((current) => current.filter((recipe) => recipe.id !== removing.id))
            setRemoving(null)
            return
          }
          setPendingRemove(true)
          const result = await deleteRecipe(removing.id)
          setPendingRemove(false)
          if (!result.ok) {
            toast(calmShoppingMessage(result.message))
            return
          }
          setRemoving(null)
          router.refresh()
        }}
      />
    </>
  )
}

function matches(recipe: { name: string; category: string | null }, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return recipe.name.toLowerCase().includes(needle) || (recipe.category ?? "").toLowerCase().includes(needle)
}
