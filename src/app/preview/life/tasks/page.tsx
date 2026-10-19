import { notFound } from "next/navigation"

import { previewIsProduction } from "@/lib/preview-access"

import { TasksBoard } from "@/components/life/tasks-board"

import { LifePreview } from "../chrome"
import { previewTasks, previewToday, previewZone } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewTasks() {
  if (previewIsProduction()) notFound()
  return (
    <LifePreview>
      <TasksBoard rows={previewTasks} today={previewToday} timeZone={previewZone} />
    </LifePreview>
  )
}
