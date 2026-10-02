import { DEFAULT_VISIBILITY, type Visibility } from "@/lib/visibility"

export type IconKey = "home" | "money" | "life" | "notes" | "vault" | "reports"

export type SectionLink = {
  href: string
  label: string
  description: string
  visibility?: Visibility
  emptyTitle: string
  emptyBody: string
}

export type PrimaryNavItem = {
  href: string
  label: string
  icon: IconKey
  description: string
  visibility?: Visibility
  emptyTitle?: string
  emptyBody?: string
  children?: SectionLink[]
}

export const primaryNav: PrimaryNavItem[] = [
  {
    href: "/home",
    label: "Home",
    icon: "home",
    description: "What matters at home today.",
  },
  {
    href: "/money",
    label: "Money",
    icon: "money",
    description: "A calm look at the household. Totals first.",
    children: [
      {
        href: "/money/budget",
        label: "Budget",
        description: "Soft monthly targets, with room to breathe.",
        visibility: DEFAULT_VISIBILITY.budget,
        emptyTitle: "Budget is on its way",
        emptyBody: "Soft targets and a buffer will live here. Nothing will shout if a week runs long.",
      },
      {
        href: "/money/bills",
        label: "Bills",
        description: "What’s due, said calmly.",
        visibility: DEFAULT_VISIBILITY.bills,
        emptyTitle: "No bills yet",
        emptyBody: "When you add one, it starts as Shared. A reminder will sound like “Electric is due in 3 days.”",
      },
      {
        href: "/money/income",
        label: "Income",
        description: "Pay and other money coming in.",
        visibility: DEFAULT_VISIBILITY.income,
        emptyTitle: "Income comes later",
        emptyBody: "Pay and other incoming money will sit here, shared with the household.",
      },
      {
        href: "/money/savings",
        label: "Savings",
        description: "What you’re setting aside, together.",
        visibility: DEFAULT_VISIBILITY.savings,
        emptyTitle: "Savings can wait",
        emptyBody: "Shared goals and what you’re setting aside will gather here.",
      },
      {
        href: "/money/debt",
        label: "Debt",
        description: "A clear, unhurried view of what you owe.",
        visibility: DEFAULT_VISIBILITY.debt,
        emptyTitle: "Debt, without the alarm",
        emptyBody: "Balances will be listed plainly when this section opens. No red banners.",
      },
    ],
  },
  {
    href: "/life",
    label: "Life",
    icon: "life",
    description: "The days, the tasks, the things you keep.",
    children: [
      {
        href: "/life/calendar",
        label: "Calendar",
        description: "What’s on the family calendar.",
        visibility: DEFAULT_VISIBILITY.calendar,
        emptyTitle: "The calendar is clear",
        emptyBody: "Family plans start as Shared. You’ll see what’s coming up, not a wall of alerts.",
      },
      {
        href: "/life/tasks",
        label: "Tasks",
        description: "A short list, not a pile.",
        visibility: DEFAULT_VISIBILITY.tasks,
        emptyTitle: "Nothing needs a nudge",
        emptyBody: "Shared tasks will show up as a short list when you’re ready to add them.",
      },
      {
        href: "/life/meals",
        label: "Meals",
        description: "What’s for dinner, and the rest of the week.",
        visibility: "shared",
        emptyTitle: "No meals planned",
        emptyBody: "Plan breakfast, lunch, and dinner for the household.",
      },
      {
        href: "/life/shopping",
        label: "Shopping",
        description: "A shared list for the next shop.",
        visibility: "shared",
        emptyTitle: "The list is clear",
        emptyBody: "Add what the household needs. New items start as Shared.",
      },
      {
        href: "/life/subscriptions",
        label: "Subscriptions",
        description: "The ones you still want.",
        visibility: DEFAULT_VISIBILITY.subscriptions,
        emptyTitle: "Subscriptions later",
        emptyBody: "The ones you keep will be listed here, quietly, as Shared household records.",
      },
    ],
  },
  {
    href: "/notes",
    label: "Notes",
    icon: "notes",
    description: "Personal notes stay just yours unless you share them.",
    visibility: DEFAULT_VISIBILITY.notes,
    emptyTitle: "A private page for notes",
    emptyBody: "New notes start as Just me. You can share one later. Nothing here is public.",
  },
  {
    href: "/vault",
    label: "Vault",
    icon: "vault",
    description: "Papers and things you own, kept close.",
    children: [
      {
        href: "/vault/documents",
        label: "Documents",
        description: "Papers for the household, kept close.",
        visibility: DEFAULT_VISIBILITY.documents,
        emptyTitle: "Documents stay in the vault",
        emptyBody: "Personal papers start as Just me. They are never public, and they are not for the whole household unless you say so.",
      },
      {
        href: "/vault/assets",
        label: "Assets",
        description: "What you own, written down when you’re ready.",
        visibility: DEFAULT_VISIBILITY.assets,
        emptyTitle: "Assets can be written down later",
        emptyBody: "Household things you own will start as Shared. You can mark a single item Just me when that matters.",
      },
    ],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    description: "A quiet look back. Charts can wait.",
    emptyTitle: "Reports will be a quiet look back",
    emptyBody: "When there’s something to reflect on, it will be a summary — not a scorecard.",
  },
]

export const settingsNav = [
  { href: "/settings#profile", label: "Profile", blurb: "Your name and photo" },
  { href: "/settings#password", label: "Password", blurb: "Change how you sign in" },
  { href: "/settings#household", label: "Household", blurb: "DeanFamily members" },
  { href: "/settings#notifications", label: "Notifications", blurb: "When something Shared is added" },
  { href: "/settings#categories", label: "Categories", blurb: "Starter budget categories" },
  { href: "/settings#currency", label: "Currency", blurb: "How amounts are shown" },
  { href: "/settings#account", label: "Account", blurb: "Email and sign out" },
] as const

export function findSection(href: string): SectionLink | PrimaryNavItem | undefined {
  for (const item of primaryNav) {
    if (item.href === href) return item
    const child = item.children?.find((entry) => entry.href === href)
    if (child) return child
  }
  return undefined
}

export function commandLinks() {
  const links: { href: string; label: string; group: string }[] = []
  for (const item of primaryNav) {
    links.push({ href: item.href, label: item.label, group: "Home" })
    for (const child of item.children ?? []) {
      links.push({ href: child.href, label: child.label, group: item.label })
    }
  }
  links.push({ href: "/notifications", label: "Notifications", group: "You" })
  links.push({ href: "/settings", label: "Settings", group: "You" })
  for (const item of settingsNav) {
    links.push({ href: item.href, label: item.label, group: "Settings" })
  }
  return links
}
