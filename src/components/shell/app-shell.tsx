"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import {
  Bell,
  ChartNoAxesColumn,
  Home,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  PanelLeft,
  Search,
  Settings,
  SunMedium,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { signOut } from "@/lib/actions/auth"
import { recentActivity } from "@/lib/actions/records"
import { primaryNav, type IconKey } from "@/lib/navigation"
import type { SessionView } from "@/lib/data/session"
import { relativeTime } from "@/lib/home/metrics"
import { LoopMark } from "@/components/brand/loop-mark"
import { Wordmark } from "@/components/brand/wordmark"
import { SearchDialog } from "@/components/shell/search-dialog"
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const icons: Record<IconKey, LucideIcon> = {
  home: Home,
  money: Wallet,
  life: SunMedium,
  notes: NotebookPen,
  vault: LockKeyhole,
  reports: ChartNoAxesColumn,
}

const mobileTabs = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/life", label: "Life", icon: SunMedium },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/more", label: "More", icon: MoreHorizontal },
]

function railCollapsed() {
  return window.localStorage.getItem("deanly-rail") === "collapsed"
}

function subscribeRail(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  return () => window.removeEventListener("storage", onStoreChange)
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function AppShell({ session, children }: { session: SessionView; children: React.ReactNode }) {
  const pathname = usePathname()
  const current = pathname.startsWith("/preview") ? "/home" : pathname
  const storedCollapsed = useSyncExternalStore(subscribeRail, railCollapsed, () => false)
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null)
  const collapsed = collapsedOverride ?? storedCollapsed
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function toggleRail() {
    const next = !collapsed
    window.localStorage.setItem("deanly-rail", next ? "collapsed" : "expanded")
    setCollapsedOverride(next)
  }

  return (
    <div className={`min-h-dvh bg-background md:grid ${collapsed ? "md:grid-cols-[68px_1fr]" : "md:grid-cols-[220px_1fr]"}`}>
      <aside className="hidden border-r border-border bg-sidebar md:flex md:flex-col">
        <div className={`flex h-14 items-center ${collapsed ? "justify-center px-2" : "justify-between px-3"}`}>
          <Link
            href="/home"
            aria-label={session.householdName ? `Deanly Tracking — ${session.householdName}` : "Deanly Tracking"}
          >
            {collapsed ? <LoopMark size={28} /> : <Wordmark household={session.householdName} />}
          </Link>
          {collapsed ? null : (
            <button type="button" onClick={toggleRail} aria-label="Collapse sidebar" className="rounded-[10px] p-1 text-muted-foreground hover:bg-surface-muted">
              <PanelLeft className="size-4" />
            </button>
          )}
        </div>
        {collapsed ? (
          <button type="button" onClick={toggleRail} aria-label="Expand sidebar" className="mx-auto mb-2 rounded-[10px] p-2 text-muted-foreground hover:bg-surface-muted">
            <PanelLeft className="size-4" />
          </button>
        ) : (
          <HouseholdChip session={session} />
        )}
        <nav aria-label="Primary" className="grid gap-1 px-2">
          {primaryNav.map((item) => {
            const Icon = icons[item.icon]
            const active = current === item.href || current.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-2.5 rounded-[10px] text-[13px] transition-colors duration-150 ${
                  collapsed ? "justify-center px-0" : "px-2.5"
                } ${active ? "bg-brand-soft font-medium text-on-brand-soft" : "text-muted-foreground hover:bg-surface-muted hover:text-ink"}`}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto grid gap-0.5 p-2">
          <Link
            href="/settings"
            title="Settings"
            className={`flex items-center gap-2 rounded-[10px] py-2 text-xs text-muted-foreground hover:text-ink ${collapsed ? "justify-center" : "px-2.5"}`}
          >
            <Settings className="size-3.5" />
            {collapsed ? <span className="sr-only">Settings</span> : "Settings"}
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              title="Log out"
              className={`flex w-full items-center gap-2 rounded-[10px] py-2 text-xs text-muted-foreground hover:text-ink ${collapsed ? "justify-center" : "px-2.5"}`}
            >
              <LogOut className="size-3.5" />
              {collapsed ? <span className="sr-only">Log out</span> : "Log out"}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-20 hidden h-14 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-muted-foreground"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search…</span>
            <kbd className="ml-auto rounded-md border border-border px-1.5 py-0.5 text-xs">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <AccountMenu session={session} />
          </div>
        </header>

        <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
          <Link href="/home" aria-label="Deanly Tracking home" className="inline-flex items-center gap-2">
            <LoopMark size={28} />
            <span className="whitespace-nowrap font-display text-[15px] font-semibold">Deanly Tracking</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search className="size-5" />
            </Button>
            <Notifications />
            <AccountMenu session={session} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-8">
          {children}
        </main>

        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-sidebar px-1 pt-1 md:hidden"
          style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
        >
          {mobileTabs.map((item) => {
            const active = item.href === "/more" ? current === "/more" : current === item.href || current.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-brand-deep" : "text-muted-foreground"}`}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}

function HouseholdChip({ session }: { session: SessionView }) {
  const name = session.householdName ?? "Household"
  return (
    <div className="mx-2 mb-3 flex items-center gap-2 px-2">
      <AvatarGroup>
        {session.members.slice(0, 4).map((member) => (
          <Avatar key={member.userId} className="size-5 after:border-brand-soft">
            {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[9px]">{initials(member.displayName)}</AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      <p className="min-w-0 truncate text-[13px] text-ink">
        {name}
        <span className="text-muted-foreground"> · {session.members.length}</span>
      </p>
    </div>
  )
}

function AccountMenu({ session }: { session: SessionView }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-7 after:border-brand-soft">
            {session.avatarUrl ? <AvatarImage src={session.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(session.displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/settings#profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings#household">Household</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOut} className="w-full">
            <button type="submit" className="w-full text-left">
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Notifications() {
  const [items, setItems] = useState<{ id: string; summary: string; created_at: string }[] | null>(null)
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) recentActivity().then(setItems)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {!items || items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">You’re all caught up.</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} className="flex flex-col items-start gap-0.5">
              <span>{item.summary}</span>
              <span className="text-xs text-muted-foreground">{relativeTime(item.created_at)}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications">All activity</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
