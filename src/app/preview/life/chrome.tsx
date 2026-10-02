import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import { primaryNav, railChildren } from "@/lib/navigation"

import { previewSession } from "../shell-session"

export function LifePreview({ children }: { children: React.ReactNode }) {
  const life = primaryNav.find((item) => item.href === "/life")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-5">
        {life ? <SectionSegments label="Life" segments={railChildren(life)} tone="life" /> : null}
        {children}
      </div>
    </AppShell>
  )
}
