"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type FocusEvent } from "react"
import { createPortal } from "react-dom"
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  Home,
  LockKeyhole,
  NotebookPen,
  PiggyBank,
  Receipt,
  Repeat,
  ShoppingCart,
  SquareCheckBig,
  SunMedium,
  TrendingUp,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import {
  pathMatches,
  primaryNav,
  railChildren,
  type IconKey,
  type PrimaryNavItem,
  type RailIcon,
  type SectionLink,
} from "@/lib/navigation"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const icons: Record<IconKey, LucideIcon> = {
  home: Home,
  money: Wallet,
  life: SunMedium,
  notes: NotebookPen,
  vault: LockKeyhole,
  reports: ChartNoAxesColumn,
}

const childIcons: Record<RailIcon, LucideIcon> = {
  receipt: Receipt,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  repeat: Repeat,
  calendar: CalendarDays,
  tasks: SquareCheckBig,
  meals: Utensils,
  shopping: ShoppingCart,
}

const rowClass =
  "flex h-10 items-center gap-2.5 rounded-[10px] text-[13px] transition-colors duration-150"

function rowTone(active: boolean) {
  return active
    ? "bg-brand-soft font-medium text-on-brand-soft"
    : "text-muted-foreground hover:bg-surface-muted hover:text-ink"
}

function ChildLink({ child, pathname, indent }: { child: SectionLink; pathname: string; indent?: boolean }) {
  const Icon = child.icon ? childIcons[child.icon] : null
  const active = pathMatches(pathname, child.href)
  return (
    <Link
      href={child.href}
      aria-current={active ? "page" : undefined}
      className={`${rowClass} ${indent ? "pl-6 pr-2.5" : "px-2.5"} ${rowTone(active)}`}
    >
      {Icon ? <Icon className="size-[18px] shrink-0" aria-hidden="true" /> : null}
      {child.label}
    </Link>
  )
}

function LeafLink({ item, pathname, collapsed }: { item: PrimaryNavItem; pathname: string; collapsed: boolean }) {
  const Icon = icons[item.icon]
  const active = pathMatches(pathname, item.href)
  const link = (
    <Link
      href={item.href}
      title={collapsed ? undefined : item.label}
      aria-current={active ? "page" : undefined}
      className={`${rowClass} ${collapsed ? "justify-center px-0" : "px-2.5"} ${rowTone(active)}`}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

function CollapsedGroup({ item, pathname }: { item: PrimaryNavItem; pathname: string }) {
  const Icon = icons[item.icon]
  const children = railChildren(item)
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const estimated = 36 + children.length * 40
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - estimated - 8))
    setBox({ top, left: rect.right + 8 })
  }

  function show() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    place()
    setOpen(true)
  }

  function hideSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 140)
  }

  function hideIfLeft(event: FocusEvent) {
    const next = event.relatedTarget
    if (next instanceof Node && (flyoutRef.current?.contains(next) || next === buttonRef.current)) return
    hideSoon()
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const nav = buttonRef.current?.closest("nav")
    const close = () => setOpen(false)
    nav?.addEventListener("scroll", close, { passive: true })
    return () => nav?.removeEventListener("scroll", close)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={item.label}
        aria-expanded={open}
        aria-haspopup="true"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideIfLeft}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          show()
          window.requestAnimationFrame(() => flyoutRef.current?.querySelector("a")?.focus())
        }}
        className={`${rowClass} justify-center px-0 text-muted-foreground hover:bg-surface-muted hover:text-ink`}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="sr-only">{item.label}</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={flyoutRef}
              role="navigation"
              aria-label={item.label}
              style={{ top: box.top, left: box.left }}
              className="fixed z-50 w-48 rounded-[12px] border border-border bg-sidebar p-1 shadow-soft"
              onMouseEnter={show}
              onMouseLeave={hideSoon}
              onBlur={hideIfLeft}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </p>
              <div className="grid gap-0.5">
                {children.map((child) => (
                  <ChildLink key={child.href} child={child} pathname={pathname} />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function RailGroup({
  item,
  pathname,
  open,
  onToggle,
}: {
  item: PrimaryNavItem
  pathname: string
  open: boolean
  onToggle: () => void
}) {
  const children = railChildren(item)
  const panelId = `rail-${item.label.toLowerCase()}`
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-ink"
      >
        <span className="flex-1">{item.label}</span>
        <ChevronDown className={`size-3.5 shrink-0 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id={panelId} className="grid gap-0.5">
          {children.map((child) => (
            <ChildLink key={child.href} child={child} pathname={pathname} indent />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DesktopNav({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  return (
    <TooltipProvider delayDuration={300}>
      <nav aria-label="Primary" className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto overscroll-y-contain px-2 pb-2">
        {primaryNav.map((item) => {
          if (!item.expandOnly) {
            return (
              <div key={item.href} className={item.href === "/notes" ? "mt-2" : undefined}>
                <LeafLink item={item} pathname={pathname} collapsed={collapsed} />
              </div>
            )
          }
          if (collapsed) return <CollapsedGroup key={item.href} item={item} pathname={pathname} />
          const childActive = railChildren(item).some((child) => pathMatches(pathname, child.href))
          const open = childActive || !closed[item.href]
          return (
            <RailGroup
              key={item.href}
              item={item}
              pathname={pathname}
              open={open}
              onToggle={() => setClosed((current) => ({ ...current, [item.href]: !current[item.href] }))}
            />
          )
        })}
      </nav>
    </TooltipProvider>
  )
}
