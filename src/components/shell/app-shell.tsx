"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChartNoAxesColumn,
  Home,
  LockKeyhole,
  NotebookPen,
  SunMedium,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { signOut } from "@/lib/actions/auth"
import { primaryNav, type IconKey } from "@/lib/navigation"
import { Wordmark } from "@/components/brand/wordmark"
import { Button } from "@/components/ui/button"

const icons: Record<IconKey, LucideIcon> = {
  home: Home,
  money: Wallet,
  life: SunMedium,
  notes: NotebookPen,
  vault: LockKeyhole,
  reports: ChartNoAxesColumn,
}

export function AppShell({
  displayName,
  children,
}: {
  displayName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-full bg-background md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-border bg-surface md:flex md:flex-col">
        <div className="px-5 py-6">
          <Link href="/home" aria-label="Deanly — DeanFamily, home">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="Primary" className="grid gap-1 px-3">
          {primaryNav.map((item) => {
            const Icon = icons[item.icon]
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  active ? "bg-brand-soft text-brand-deep" : "text-ink hover:bg-surface-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto grid gap-2 p-4">
          <Link href="/settings" className="px-3 text-sm text-muted-foreground hover:text-ink">
            Settings
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full rounded-button">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <Link href="/home" aria-label="Deanly — DeanFamily, home">
            <Wordmark size="sm" />
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <nav aria-label="Primary" className="flex gap-2 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:hidden">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1 text-sm text-ink hover:bg-brand-soft"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main id="main" className="flex-1 px-4 py-6 md:px-6">
          <p className="sr-only">Signed in as {displayName}</p>
          {children}
        </main>
      </div>
    </div>
  )
}
