"use client"

import { useRef, useState } from "react"

import { phoneSheetClass } from "@/components/money/money-chrome"
import { StaleChoice } from "@/components/life/stale-choice"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SHOPPING_CATEGORY_IDS, type RecipeRow } from "@/lib/life/recipes"
import { shoppingCategoryLabel } from "@/lib/life/shopping"
import { cn } from "cn"

const field = "h-10 min-w-0 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink"

type Line = { name: string; quantity: string; unit: string; category: string }

type SaveResult = { ok: boolean; message?: string; conflict?: boolean }

function linesOf(recipe: RecipeRow | null): Line[] {
  if (!recipe) return [{ name: "", quantity: "", unit: "", category: "" }]
  if (!recipe.ingredients.length) return [{ name: "", quantity: "", unit: "", category: "" }]
  return recipe.ingredients.map((item) => ({
    name: item.name,
    quantity: item.quantity ?? "",
    unit: item.unit ?? "",
    category: item.category ?? "",
  }))
}

export function RecipeForm({
  open,
  recipe,
  showConflict = false,
  onOpenChange,
  onSubmit,
  onUseTheirs,
}: {
  open: boolean
  recipe: RecipeRow | null
  showConflict?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (formData: FormData) => Promise<SaveResult>
  onUseTheirs?: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [lines, setLines] = useState<Line[]>(() => linesOf(recipe))
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState("")
  const [conflict, setConflict] = useState(showConflict)

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  function finish(formData: FormData) {
    formData.set("ingredients", JSON.stringify(lines))
    if (recipe) formData.set("id", recipe.id)
    setPending(true)
    void onSubmit(formData).then((result) => {
      setPending(false)
      if (!result.ok) {
        if (result.conflict) {
          setConflict(true)
          return
        }
        setNote(result.message ?? "Couldn’t save that recipe.")
        return
      }
      setNote("")
      setConflict(false)
      onOpenChange(false)
    })
  }

  function keepMine() {
    const form = formRef.current
    if (!form || pending) return
    const formData = new FormData(form)
    formData.set("keep_mine", "1")
    finish(formData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[520px]", phoneSheetClass)}>
        <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{recipe ? "Edit recipe" : "Add recipe"}</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          className="grid max-h-[70dvh] min-w-0 gap-3 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault()
            finish(new FormData(event.currentTarget))
          }}
        >
          {conflict ? <StaleChoice onUseTheirs={() => onUseTheirs?.()} onKeepMine={keepMine} /> : null}
          <input type="hidden" name="updated_at" defaultValue={recipe?.updated_at ?? ""} />
          <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
            Name
            <input name="name" required defaultValue={recipe?.name ?? ""} className={field} />
          </label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
              Category
              <input name="category" defaultValue={recipe?.category ?? ""} placeholder="Optional" className={field} />
            </label>
            <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
              Servings
              <input name="servings" type="number" min={1} max={50} required defaultValue={recipe?.servings ?? 4} className={field} />
            </label>
          </div>
          <fieldset className="grid min-w-0 gap-2">
            <legend className="text-[13px] text-muted-foreground">Ingredients</legend>
            {lines.map((line, index) => (
              <div key={index} className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.4fr)_72px_72px_minmax(0,1fr)_auto]">
                <input aria-label={`Ingredient ${index + 1}`} value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} placeholder="Name" className={cn(field, "col-span-2 md:col-span-1")} />
                <input aria-label={`Quantity ${index + 1}`} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} placeholder="Qty" className={field} />
                <input aria-label={`Unit ${index + 1}`} value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} placeholder="Unit" className={field} />
                <select aria-label={`Shopping category ${index + 1}`} value={line.category} onChange={(event) => updateLine(index, { category: event.target.value })} className={cn(field, "col-span-2 md:col-span-1")}>
                  <option value="">No category</option>
                  {SHOPPING_CATEGORY_IDS.map((id) => (
                    <option key={id} value={id}>
                      {shoppingCategoryLabel(id)}
                    </option>
                  ))}
                </select>
                <button type="button" className="h-10 text-[13px] text-muted-foreground" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="justify-self-start text-sm font-medium text-brand-deep" onClick={() => setLines((current) => [...current, { name: "", quantity: "", unit: "", category: "" }])}>
              Add ingredient
            </button>
          </fieldset>
          <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
            Steps
            <textarea name="steps" defaultValue={recipe?.steps.join("\n") ?? ""} rows={4} placeholder="One step per line" className="min-h-24 min-w-0 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
            Notes
            <textarea name="notes" defaultValue={recipe?.notes ?? ""} rows={2} className="min-h-16 min-w-0 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
            Who can see it
            <select name="visibility" defaultValue={recipe?.visibility ?? "shared"} className={field}>
              <option value="shared">Shared</option>
              <option value="private">Just me</option>
            </select>
          </label>
          {note ? <p className="text-sm text-ink">{note}</p> : null}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="h-10 rounded-button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 rounded-button" disabled={pending}>
              {pending ? "Saving…" : "Save recipe"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
