import { notFound } from "next/navigation"

import { EventsBoard } from "@/components/records/section-board"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import { primaryNav, railChildren } from "@/lib/navigation"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

export default function PreviewCalendar() {
  if (process.env.NODE_ENV === "production") notFound()
  const life = primaryNav.find((item) => item.href === "/life")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        {life ? <SectionSegments label="Life" segments={railChildren(life)} /> : null}
        <EventsBoard
          rows={[
            {
              id: "ev1",
              title: "School pickup",
              starts_at: "2026-10-02T19:30:00.000Z",
              location: "Home",
              visibility: "shared",
            },
          ]}
          today="2026-10-02"
          timeZone="America/New_York"
          visibility="shared"
        />
      </div>
    </AppShell>
  )
}
