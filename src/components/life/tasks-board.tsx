"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { CheckControl, LifeFab, useLifeVisibility } from "@/components/life/life-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { Button } from "@/components/ui/button"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RhythmStrip,
  RowMenu,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { deleteTask, setTaskComplete, setTaskVisibility } from "@/lib/actions/records"
import type { TaskRow } from "@/lib/data/home"
import {
  LIFE_COPY,
  filterLife,
  lifeSubtitle,
  sortTasks,
  taskDueCopy,
  taskMetrics,
  taskPulseCells,
} from "@/lib/life/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

const dueTone = {
  success: "text-success",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const

export function TasksBoard({
  rows,
  today,
  timeZone,
  error,
}: {
  rows: TaskRow[]
  today: string
  timeZone: string
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const { patch, merge } = useRowPatches<TaskRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<TaskRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortTasks(filterLife(items, filter), today)
  const metrics = taskMetrics(visible, today, timeZone)
  const pulse = taskPulseCells(visible, today)

  function clearFilters() {
    setFilter("all")
  }

  async function markDone(task: TaskRow, complete: boolean) {
    const previous = task.completed_at
    const next = complete ? new Date().toISOString() : null
    patch(task.id, { completed_at: next })
    const result = await setTaskComplete(task.id, complete)
    if (!result.ok) {
      patch(task.id, { completed_at: previous })
      toast(result.message)
      return
    }
    if (complete) {
      toast(LIFE_COPY.markedDone, {
        duration: 5000,
        action: { label: "Undo", onClick: () => void markDone(task, false) },
      })
    }
    router.refresh()
  }

  async function changeVisibility(task: TaskRow, visibility: Visibility) {
    const previous = task.visibility
    patch(task.id, { visibility })
    const result = await setTaskVisibility(task.id, visibility)
    if (!result.ok) {
      patch(task.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  function openEdit(task: TaskRow) {
    setEditing(task)
    setEditOpen(true)
  }

  return (
    <>
      <MoneyFrame
        phoneTouch
        title="Tasks"
        subtitle={lifeSubtitle("tasks")}
        filter={filter}
        onFilter={setFilter}
        action={
          <div className="hidden md:block">
            <MoneyAddButton onClick={() => setAdding(true)}>Add task</MoneyAddButton>
          </div>
        }
        chips={
          <>
            <MetricChip tone={metrics.dueToday > 0 ? "brand" : "muted"}>{metrics.dueToday} due today</MetricChip>
            <MetricChip tone="success">{metrics.doneThisWeek} done</MetricChip>
          </>
        }
        pulse={<RhythmStrip title="Due soon" cells={pulse} empty={LIFE_COPY.tasksPulseEmpty} />}
      >
        {error ? <WidgetError /> : null}
        {items.length === 0 ? (
          <EmptyState copy={LIFE_COPY.tasksEmpty} action={<MoneyAddButton onClick={() => setAdding(true)}>Add task</MoneyAddButton>} />
        ) : null}
        {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
        {visible.map((task) => {
          const due = taskDueCopy(task, today)
          const done = Boolean(task.completed_at)
          return (
            <MoneyCard key={task.id} id={`item-${task.id}`} onOpen={() => openEdit(task)}>
              <div className="flex flex-wrap items-start gap-1">
                <CheckControl
                  checked={done}
                  label={done ? `Mark ${task.title} open` : `Mark ${task.title} done`}
                  onToggle={() => void markDone(task, !done)}
                />
                <div className="min-w-0 flex-1 pt-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-[15px] font-medium text-ink", done && "text-muted-foreground line-through")}>{task.title}</p>
                    <VisibilityPill visibility={task.visibility} />
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
                  {done ? (
                    <span className="inline-flex h-8 max-md:min-h-11 max-md:items-center items-center rounded-full bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))] px-2.5 text-[13px] font-medium text-success">
                      Done
                    </span>
                  ) : (
                    <>
                      {due.tone === "danger" ? (
                        <p className="inline-flex items-center gap-1 text-[13px] text-danger">
                          <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                          {due.text}
                        </p>
                      ) : (
                        <p className={cn("text-[13px]", dueTone[due.tone])}>{due.text}</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 max-md:min-h-11 rounded-[12px] px-3 text-[13px] text-brand-deep"
                        onClick={() => void markDone(task, true)}
                      >
                        Done
                      </Button>
                    </>
                  )}
                  <RowMenu
                    className="max-md:min-h-11 max-md:min-w-11"
                    label={task.title}
                    visibility={task.visibility}
                    onEdit={() => openEdit(task)}
                    onVisibility={(visibility) => void changeVisibility(task, visibility)}
                    onRemove={() => setRemoving(task)}
                  />
                </div>
              </div>
            </MoneyCard>
          )
        })}
        <RecordDialog
          key={adding ? "task-add" : "task-idle"}
          kind="task"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={adding}
          onOpenChange={setAdding}
        />
        {editing ? (
          <RecordDialog
            key={editing.id}
            kind="task"
            today={today}
            defaultVisibility="shared"
            sheetOnPhone
            open={editOpen}
            onOpenChange={setEditOpen}
            initial={{
              id: editing.id,
              title: editing.title,
              date: editing.due_on ?? "",
              visibility: editing.visibility,
            }}
          />
        ) : null}
        <ConfirmRemove
          sheetOnPhone
          open={Boolean(removing)}
          title="Remove this task?"
          pending={pendingRemove}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          onConfirm={async () => {
            if (!removing) return
            setPendingRemove(true)
            const result = await deleteTask(removing.id)
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
      <LifeFab>
        <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
          Add task
        </MoneyAddButton>
      </LifeFab>
    </>
  )
}
