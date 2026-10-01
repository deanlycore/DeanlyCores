import type { Metadata } from "next"

import { TasksBoard } from "@/components/records/section-board"
import { listTasks } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Tasks" }

export default async function Page() {
  const [clock, tasks] = await Promise.all([pageClock(), listTasks()])
  return <TasksBoard rows={tasks.rows} today={clock.today} visibility={tasks.visibility} error={tasks.error} />
}
