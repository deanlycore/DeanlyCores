import { LifeSectionNav } from "@/components/life/life-section-nav"
import { AppShell } from "@/components/shell/app-shell"

import { previewSession } from "../shell-session"

export function LifePreview({ children }: { children: React.ReactNode }) {
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-5">
        <LifeSectionNav />
        {children}
      </div>
    </AppShell>
  )
}
