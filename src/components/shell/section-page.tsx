import Link from "next/link"

import { Wordmark } from "@/components/brand/wordmark"
import { findSection } from "@/lib/navigation"
import { visibilityLabel, type Visibility } from "@/lib/visibility"

export function SectionPage({ href }: { href: string }) {
  const section = findSection(href)
  const title = section?.label ?? "Coming soon"
  const body =
    ("emptyBody" in (section ?? {}) && section && "emptyBody" in section
      ? section.emptyBody
      : undefined) ??
    ("description" in (section ?? {}) ? section?.description : undefined) ??
    "This part of Deanly Tracking is next."
  const visibility = section && "visibility" in section ? (section.visibility as Visibility | undefined) : undefined

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="deanly-card p-6">
        {visibility ? (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              visibility === "private" ? "bg-sand text-sand-ink" : "bg-brand-soft text-brand-deep"
            }`}
          >
            {visibilityLabel(visibility)}
          </span>
        ) : null}
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{body}</p>
        <p className="mt-4 text-sm text-muted-foreground">Open a section from the sidebar to add something.</p>
        <div className="mt-8">
          <Wordmark size="sm" />
        </div>
      </div>
      <Link href="/home" className="text-sm text-brand-deep hover:underline">
        Back home
      </Link>
    </div>
  )
}
