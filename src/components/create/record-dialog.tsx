"use client"

import { useState } from "react"
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
  uploadDocument,
  type ActionResult,
} from "@/lib/actions/records"
import type { Visibility } from "@/lib/visibility"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  income: "Log income",
  note: "New note",
  upload: "Upload a document",
  subscription: "Add a subscription",
}

const field = "h-11 rounded-button bg-surface px-3"

export function RecordDialog({
  kind,
  trigger,
  defaultVisibility,
  today,
}: {
  kind: RecordKind
  trigger: React.ReactNode
  defaultVisibility: Visibility
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const visibilityDefault =
    kind === "shopping" || kind === "budget" ? "shared" : kind === "note" || kind === "upload" ? "private" : defaultVisibility

  async function onSubmit(formData: FormData) {
    setPending(true)
    setMessage(null)
    formData.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (kind === "income") formData.set("kind", "income")
    if (kind === "expense") formData.set("kind", "expense")
    const action = actions[kind]
    const result = await action(formData)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{titles[kind]}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid gap-3">
          {kind === "bill" ? (
            <>
              <Field label="Name" name="name" />
              <Field label="Amount" name="amount" inputMode="decimal" placeholder="0.00" />
              <Field label="Due" name="due_on" type="date" defaultValue={today} />
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
              <Field label="Goal" name="name" />
              <Field label="Target" name="target" inputMode="decimal" placeholder="0.00" />
              <Field label="Already saved" name="current" inputMode="decimal" placeholder="0.00" required={false} />
            </>
          ) : null}
          {kind === "budget" ? <Field label="Monthly budget" name="amount" inputMode="decimal" placeholder="0.00" /> : null}
          {kind === "expense" || kind === "income" ? (
            <>
              <Field label="Name" name="name" />
              <Field label="Amount" name="amount" inputMode="decimal" placeholder="0.00" />
              <Field label="Date" name="spent_on" type="date" defaultValue={today} />
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
              <Field label="Name" name="name" />
              <Field label="Amount" name="amount" inputMode="decimal" placeholder="0.00" />
              <Field label="Renews" name="renews_on" type="date" defaultValue={today} />
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
          <Button type="submit" disabled={pending} className="h-11 rounded-button text-primary-foreground">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
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
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  inputMode,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
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
