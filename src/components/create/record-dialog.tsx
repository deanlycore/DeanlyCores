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
  updateExpense,
  updateGoal,
  updateSubscription,
  uploadDocument,
  type ActionResult,
} from "@/lib/actions/records"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  visibility?: Visibility
}

const editTitles: Partial<Record<RecordKind, string>> = {
  bill: "Edit bill",
  income: "Edit income",
  goal: "Edit goal",
  subscription: "Edit subscription",
  expense: "Edit spending",
}

const saveLabels: Partial<Record<RecordKind, string>> = {
  bill: "Save bill",
  income: "Save income",
  goal: "Save goal",
  subscription: "Save subscription",
}

export function RecordDialog({
  kind,
  trigger,
  defaultVisibility,
  today,
  open: openProp,
  onOpenChange,
  initial,
}: {
  kind: RecordKind
  trigger?: React.ReactNode
  defaultVisibility: Visibility
  today: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initial?: RecordInitial
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
  const visibilityDefault = initial?.visibility ?? defaultVisibilityFor(kind, defaultVisibility)

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
      <DialogContent className="sm:max-w-[440px]">
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
              <Field label="Task" name="title" />
              <Field label="Due" name="due_on" type="date" defaultValue={today} />
            </>
          ) : null}
          {kind === "event" ? (
            <>
              <Field label="Title" name="title" />
              <Field label="Date" name="date" type="date" defaultValue={today} />
              <Field label="Time" name="time" type="time" defaultValue="09:00" />
              <Field label="Place" name="location" required={false} />
            </>
          ) : null}
          {kind === "meal" ? (
            <>
              <Field label="Meal" name="title" />
              <Field label="Day" name="meal_on" type="date" defaultValue={today} />
              <label className="grid gap-1.5 text-sm">
                Slot
                <select name="slot" defaultValue="dinner" className={field}>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </label>
            </>
          ) : null}
          {kind === "shopping" ? <Field label="Item" name="name" /> : null}
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
              <Field label="Title" name="title" />
              <label className="grid gap-1.5 text-sm">
                Note
                <textarea name="body" rows={4} className="rounded-button border border-input bg-surface px-3 py-2 text-sm" />
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
            </>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="text-sm">Who can see this</legend>
            <div className="flex gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="visibility" value="shared" defaultChecked={visibilityDefault !== "private"} />
                Shared
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="visibility" value="private" defaultChecked={visibilityDefault === "private"} />
                Just me
              </label>
            </div>
          </fieldset>
          {message ? <p className="text-sm text-danger">{message}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-10 rounded-button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} className="h-10 rounded-button text-primary-foreground">
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
