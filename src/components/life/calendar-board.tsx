"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useLifeVisibility, WeekStrip } from "@/components/life/life-chrome"
import { RecordDialog } from "@/components/create/record-dialog"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { deleteEvent, setEventVisibility } from "@/lib/actions/records"
import type { EventRow } from "@/lib/data/home"
import { formatShortDate } from "@/lib/home/metrics"
import {
  LIFE_COPY,
  calendarEmpty,
  calendarMetrics,
  calendarWeekCells,
  eventFormWhen,
  eventLocalDate,
  eventWhen,
  filterLife,
  lifeSubtitle,
  sortEvents,
  weekHasEvents,
  weekdayShort,
} from "@/lib/life/board"
import type { Visibility } from "@/lib/visibility"

export function CalendarBoard({
  rows,
  today,
  timeZone,
  householdName,
  error,
}: {
  rows: EventRow[]
  today: string
  timeZone: string
  householdName?: string | null
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const { patch, merge } = useRowPatches<EventRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<EventRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<EventRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortEvents(filterLife(items, filter), today, timeZone)
  const metrics = calendarMetrics(visible, today, timeZone)
  const pulse = calendarWeekCells(visible, today, timeZone)

  function clearFilters() {
    setFilter("all")
  }

  async function changeVisibility(event: EventRow, visibility: Visibility) {
    const previous = event.visibility
    patch(event.id, { visibility })
    const result = await setEventVisibility(event.id, visibility)
    if (!result.ok) {
      patch(event.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  function openEdit(event: EventRow) {
    setEditing(event)
    setEditOpen(true)
  }

  const when = editing ? eventFormWhen(editing.starts_at, editing.ends_at, timeZone) : null

  return (
    <MoneyFrame
      phoneTouch
      title="Calendar"
      subtitle={lifeSubtitle("calendar", householdName)}
      filter={filter}
      onFilter={setFilter}
      action={
        <MoneyAddButton className="h-11 md:h-10" onClick={() => setAdding(true)}>
          Add event
        </MoneyAddButton>
      }
      chips={
        <>
          <MetricChip tone={metrics.todayCount > 0 ? "brand" : "muted"}>{metrics.todayCount} today</MetricChip>
          <MetricChip>{metrics.weekCount} this week</MetricChip>
          <MetricChip tone={metrics.shared > 0 ? "brand" : "muted"}>{metrics.shared} shared</MetricChip>
        </>
      }
      pulse={
        <WeekStrip title="This week" cells={pulse} filled={weekHasEvents(visible, today, timeZone)} empty={LIFE_COPY.eventsPulseEmpty} />
      }
    >
      {error ? <WidgetError /> : null}
      {items.length === 0 ? <EmptyState copy={calendarEmpty(householdName)} action={<MoneyAddButton onClick={() => setAdding(true)}>Add event</MoneyAddButton>} /> : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
      {visible.map((event) => {
        const date = eventLocalDate(event.starts_at, timeZone)
        return (
          <MoneyCard key={event.id} id={`item-${event.id}`} onOpen={() => openEdit(event)}>
            <div className="flex flex-wrap items-start gap-3">
              <p className="w-16 shrink-0 pt-0.5 text-[13px] font-medium tabular-nums text-ink">
                {eventWhen(event.starts_at, event.ends_at, timeZone)}
              </p>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-medium text-ink">{event.title}</p>
                  <VisibilityPill visibility={event.visibility} />
                </div>
                {event.location ? <p className="mt-0.5 text-[13px] text-muted-foreground">{event.location}</p> : null}
              </div>
              <div className="ml-auto flex items-center gap-2" onClick={(click) => click.stopPropagation()}>
                <p className="text-[13px] text-muted-foreground">
                  {weekdayShort(date)} {formatShortDate(date)}
                </p>
                <RowMenu
                  className="max-md:min-h-11 max-md:min-w-11"
                  label={event.title}
                  visibility={event.visibility}
                  onEdit={() => openEdit(event)}
                  onVisibility={(visibility) => void changeVisibility(event, visibility)}
                  onRemove={() => setRemoving(event)}
                />
              </div>
            </div>
          </MoneyCard>
        )
      })}
      <RecordDialog
        key={adding ? "event-add" : "event-idle"}
        kind="event"
        today={today}
        defaultVisibility="shared"
        sheetOnPhone
        open={adding}
        onOpenChange={setAdding}
      />
      {editing && when ? (
        <RecordDialog
          key={editing.id}
          kind="event"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            title: editing.title,
            date: when.date,
            endDate: when.endDate,
            time: when.time,
            allDay: when.allDay,
            location: editing.location ?? "",
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
        open={Boolean(removing)}
        title="Remove this event?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteEvent(removing.id)
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
  )
}
