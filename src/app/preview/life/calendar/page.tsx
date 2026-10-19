import { notFound } from "next/navigation"

import { previewIsProduction } from "@/lib/preview-access"

import { CalendarBoard } from "@/components/life/calendar-board"

import { LifePreview } from "../chrome"
import { previewEvents, previewToday, previewZone } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewCalendar() {
  if (previewIsProduction()) notFound()
  return (
    <LifePreview>
      <CalendarBoard rows={previewEvents} today={previewToday} timeZone={previewZone} householdName="My household" />
    </LifePreview>
  )
}
