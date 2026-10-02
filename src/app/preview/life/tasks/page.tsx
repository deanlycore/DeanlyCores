import { notFound } from "next/navigation"

import { TasksBoard } from "@/components/life/tasks-board"

import { LifePreview } from "../chrome"
import { previewTasks, previewToday, previewZone } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewTasks() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <LifePreview>
      <TasksBoard rows={previewTasks} today={previewToday} timeZone={previewZone} />
    </LifePreview>
  )
}
