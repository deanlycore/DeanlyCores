import type { WidgetId } from "@/lib/dashboard/layout"

export type WidgetMeta = {
  id: WidgetId
  title: string
  question: string
  href: string
  action: string
  empty: string
  span: string
}

export const widgetMeta: Record<WidgetId, WidgetMeta> = {
  money: {
    id: "money",
    title: "Money",
    question: "How does money feel this month?",
    href: "/money",
    action: "Open money",
    empty: "Nothing logged yet. When bills and income arrive, this stays a quiet snapshot.",
    span: "xl:col-span-7",
  },
  tasks: {
    id: "tasks",
    title: "Tasks",
    question: "What needs a gentle nudge?",
    href: "/life/tasks",
    action: "See tasks",
    empty: "A clear plate. Tasks you share will show up here.",
    span: "xl:col-span-5",
  },
  calendar: {
    id: "calendar",
    title: "Calendar",
    question: "What’s coming up for us?",
    href: "/life/calendar",
    action: "Open calendar",
    empty: "No dates on the board. Family plans will land here.",
    span: "xl:col-span-4",
  },
  goals: {
    id: "goals",
    title: "Goals",
    question: "What are we moving toward?",
    href: "/money/savings",
    action: "See savings",
    empty: "No goals yet. When you’re ready, we’ll keep them in view.",
    span: "xl:col-span-4",
  },
  reminders: {
    id: "reminders",
    title: "Reminders",
    question: "What should we remember?",
    href: "/notifications",
    action: "Reminder settings",
    empty: "All quiet. A note will sound like “Electric is due in 3 days.” Never an alarm.",
    span: "xl:col-span-4",
  },
}
