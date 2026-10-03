"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createBill,
  createEvent,
  createExpense,
  createGoal,
  createMeal,
  createNote,
  createShoppingItem,
  createSubscription,
  createTask,
  saveBudget,
  updateBill,
  updateEvent,
  updateExpense,
  updateGoal,
  updateMeal,
  updateShoppingItem,
  updateSubscription,
  updateTask,
  uploadDocument,
  type ActionResult,
} from "@/lib/actions/records"
import { CategoryField } from "@/components/money/category-field"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"
import { phoneSheetClass } from "@/components/money/money-chrome"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type RecordKind =
  | "bill"
  | "task"
  | "event"
  | "meal"
  | "shopping"
  | "goal"
  | "budget"
  | "expense"
  | "income"
  | "note"
  | "upload"
  | "subscription"

const titles: Record<RecordKind, string> = {
  bill: "Add a bill",
  task: "Add a task",
  event: "Add an event",
  meal: "Add a meal",
  shopping: "Add to the list",
  goal: "Add a savings goal",
  budget: "Set this month’s budget",
  expense: "Log spending",
  income: "Add income",
  note: "New note",
  upload: "Upload a document",
  subscription: "Add a subscription",
}

const field = "h-11 rounded-button bg-surface px-3"

export type RecordInitial = {
  id: string
  name?: string
  title?: string
  amount?: string
  date?: string
  current?: string
  target?: string
  body?: string
  endDate?: string
  time?: string
  location?: string
  slot?: string
  notes?: string
  store?: string
  storeOther?: string
  needSoon?: boolean
  allDay?: boolean
  visibility?: Visibility
  category?: string | null
  cadence?: "month" | "year" | null
}

const editTitles: Partial<Record<RecordKind, string>> = {
  bill: "Edit bill",
  income: "Edit income",
  goal: "Edit goal",
  subscription: "Edit subscription",
  expense: "Edit spending",
  task: "Edit task",
  event: "Edit event",
  meal: "Edit meal",
  shopping: "Edit item",
}

const saveLabels: Partial<Record<RecordKind, string>> = {
  bill: "Save bill",
  income: "Save income",
  goal: "Save goal",
  subscription: "Save subscription",
  task: "Save task",
  event: "Save event",
  meal: "Save meal",
  shopping: "Save item",
  note: "Create",
}

export function RecordDialog({
  kind,
  trigger,
  defaultVisibility,
  today,
  open: openProp,
  onOpenChange,
  initial,
  sheetOnPhone = false,
  extra,
  categories = [],
}: {
  kind: RecordKind
  trigger?: React.ReactNode
  defaultVisibility: Visibility
  today: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initial?: RecordInitial
  sheetOnPhone?: boolean
  extra?: React.ReactNode
  /** Names already on rows this session can read. Starters are added in the field. */
  categories?: (string | null | undefined)[]
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function setOpen(next: boolean) {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const formId = useId()
  const [allDay, setAllDay] = useState(Boolean(initial?.allDay))
  const visibilityDefault = initial?.visibility ?? defaultVisibilityFor(kind, defaultVisibility)
  const categorySection =
    kind === "bill" ? "bills" : kind === "income" ? "income" : kind === "goal" ? "savings" : kind === "subscription" ? "subscriptions" : null

  async function onSubmit(formData: FormData) {
    setPending(true)
    setMessage(null)
    try {
      formData.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone)
      if (kind === "income") formData.set("kind", "income")
      if (kind === "expense") formData.set("kind", "expense")
      const recordId = initial?.id
      const update = recordId ? updates[kind] : undefined
      const result = update && recordId ? await update(recordId, formData) : await actions[kind](formData)
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setOpen(false)
      if (kind === "note" && result.id) {
        router.push(`/notes/${result.id}`)
        return
      }
      router.refresh()
    } catch {
      setMessage("Couldn’t save that. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn("sm:max-w-[440px]", sheetOnPhone && phoneSheetClass)}>
        {sheetOnPhone ? <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" /> : null}
        <DialogHeader>
          <DialogTitle className="font-display">{initial ? (editTitles[kind] ?? titles[kind]) : titles[kind]}</DialogTitle>
        </DialogHeader>
        <form key={initial?.id ?? "new"} action={onSubmit} className="grid gap-3">
          {kind === "bill" ? (
            <>
              <Field id={`${formId}-name`} label="Name" name="name" defaultValue={initial?.name} />
              <Field id={`${formId}-amount`} label="Amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={initial?.amount} />
              <Field id={`${formId}-due`} label="Due" name="due_on" type="date" defaultValue={initial?.date ?? today} />
            </>
          ) : null}
          {kind === "task" ? (
            <>
              <Field id={`${formId}-title`} label="Task" name="title" defaultValue={initial?.title} />
              <Field id={`${formId}-due`} label="Due" name="due_on" type="date" required={false} defaultValue={initial?.date ?? ""} />
            </>
          ) : null}
          {kind === "event" ? (
            <>
              <Field id={`${formId}-title`} label="Title" name="title" defaultValue={initial?.title} />
              <Field id={`${formId}-date`} label="Date" name="date" type="date" defaultValue={initial?.date ?? today} />
              <Field id={`${formId}-end`} label="End date" name="end_date" type="date" required={false} defaultValue={initial?.endDate ?? ""} />
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
                All day
              </label>
              {allDay ? null : (
                <Field id={`${formId}-time`} label="Time" name="time" type="time" required={false} defaultValue={initial?.time ?? "09:00"} />
              )}
              <Field id={`${formId}-place`} label="Place" name="location" required={false} defaultValue={initial?.location} />
            </>
          ) : null}
          {kind === "meal" ? (
            <>
              <Field id={`${formId}-title`} label="Dish" name="title" defaultValue={initial?.title} />
              <Field id={`${formId}-day`} label="Day" name="meal_on" type="date" defaultValue={initial?.date ?? today} />
              <label className="grid gap-1.5 text-sm">
                Slot
                <select name="slot" defaultValue={initial?.slot ?? "dinner"} className={field}>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </label>
              <Field id={`${formId}-notes`} label="Leftovers" name="notes" required={false} defaultValue={initial?.notes} placeholder="Soft note, if any" />
            </>
          ) : null}
          {kind === "shopping" ? (
            <>
              <Field id={`${formId}-name`} label="Item" name="name" defaultValue={initial?.name} />
              <label className="grid gap-1.5 text-sm">
                Store
                <select name="store" defaultValue={initial?.store ?? ""} className={field}>
                  <option value="">No store</option>
                  <option value="Costco">Costco</option>
                  <option value="Smith's">Smith&apos;s</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field id={`${formId}-store-other`} label="Other store" name="store_other" required={false} defaultValue={initial?.storeOther} />
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="need_soon" defaultChecked={Boolean(initial?.needSoon)} />
                Need soon
              </label>
            </>
          ) : null}
          {kind === "goal" ? (
            <>
              <Field id={`${formId}-goal`} label="Goal" name="name" defaultValue={initial?.name} />
              <Field id={`${formId}-target`} label="Target" name="target" inputMode="decimal" placeholder="0.00" defaultValue={initial?.target} />
              <Field id={`${formId}-current`} label="Already saved" name="current" inputMode="decimal" placeholder="0.00" required={false} defaultValue={initial?.current} />
            </>
          ) : null}
          {kind === "budget" ? <Field label="Monthly budget" name="amount" inputMode="decimal" placeholder="0.00" /> : null}
          {kind === "expense" || kind === "income" ? (
            <>
              <Field id={`${formId}-name`} label="Name" name="name" defaultValue={initial?.name} />
              <Field id={`${formId}-amount`} label="Amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={initial?.amount} />
              <Field id={`${formId}-date`} label="Date" name="spent_on" type="date" defaultValue={initial?.date ?? today} />
            </>
          ) : null}
          {kind === "note" ? (
            <>
              <Field id={`${formId}-title`} label="Title" name="title" />
              <label className="grid gap-1.5 text-sm" htmlFor={`${formId}-body`}>
                Note
                <textarea id={`${formId}-body`} name="body" rows={4} className="rounded-button border border-input bg-surface px-3 py-2 text-sm" />
              </label>
            </>
          ) : null}
          {kind === "upload" ? (
            <label className="grid gap-1.5 text-sm">
              File
              <input name="file" type="file" required className="text-sm" />
            </label>
          ) : null}
          {kind === "subscription" ? (
            <>
              <Field id={`${formId}-name`} label="Name" name="name" defaultValue={initial?.name} />
              <Field id={`${formId}-amount`} label="Amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={initial?.amount} />
              <Field id={`${formId}-renews`} label="Renews" name="renews_on" type="date" defaultValue={initial?.date ?? today} />
              <fieldset className="grid gap-2">
                <legend className="text-sm">How often</legend>
                <div className="flex gap-3 text-sm">
                  <label className={cn("inline-flex items-center gap-2", sheetOnPhone && "max-md:min-h-11")}>
                    <input type="radio" name="cadence" value="month" defaultChecked={initial?.cadence !== "year"} />
                    Monthly
                  </label>
                  <label className={cn("inline-flex items-center gap-2", sheetOnPhone && "max-md:min-h-11")}>
                    <input type="radio" name="cadence" value="year" defaultChecked={initial?.cadence === "year"} />
                    Yearly
                  </label>
                </div>
              </fieldset>
            </>
          ) : null}
          {categorySection ? (
            <CategoryField section={categorySection} used={categories} value={initial?.category} id={`${formId}-category`} />
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="text-sm">Who can see this</legend>
            <div className="flex gap-3 text-sm">
              <label className={cn("inline-flex items-center gap-2", sheetOnPhone && "max-md:min-h-11")}>
                <input type="radio" name="visibility" value="shared" defaultChecked={visibilityDefault !== "private"} />
                Shared
              </label>
              <label className={cn("inline-flex items-center gap-2", sheetOnPhone && "max-md:min-h-11")}>
                <input type="radio" name="visibility" value="private" defaultChecked={visibilityDefault === "private"} />
                Just me
              </label>
            </div>
          </fieldset>
          {extra}
          {message ? <p className="text-sm text-danger">{message}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className={cn("h-10 rounded-button", sheetOnPhone && "max-md:min-h-11")}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} className={cn("h-10 rounded-button text-primary-foreground", sheetOnPhone && "max-md:min-h-11")}>
              {pending ? "Saving…" : (saveLabels[kind] ?? "Save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const updates: Partial<Record<RecordKind, (id: string, formData: FormData) => Promise<ActionResult>>> = {
  bill: updateBill,
  expense: updateExpense,
  income: updateExpense,
  goal: updateGoal,
  subscription: updateSubscription,
  task: updateTask,
  event: updateEvent,
  meal: updateMeal,
  shopping: updateShoppingItem,
}

const actions: Record<RecordKind, (formData: FormData) => Promise<ActionResult>> = {
  bill: createBill,
  task: createTask,
  event: createEvent,
  meal: createMeal,
  shopping: createShoppingItem,
  goal: createGoal,
  budget: saveBudget,
  expense: createExpense,
  income: createExpense,
  note: createNote,
  upload: uploadDocument,
  subscription: createSubscription,
}

function Field({
  id,
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  inputMode,
}: {
  id?: string
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  const fieldId = id ?? name
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className={field}
      />
    </div>
  )
}
