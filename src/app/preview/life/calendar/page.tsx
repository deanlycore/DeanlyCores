import { notFound } from "next/navigation"

import { CalendarBoard } from "@/components/life/calendar-board"

import { LifePreview } from "../chrome"
import { previewEvents, previewToday, previewZone } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewCalendar() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <LifePreview>
      <CalendarBoard rows={previewEvents} today={previewToday} timeZone={previewZone} householdName="DeanFamily" />
    </LifePreview>
  )
}
