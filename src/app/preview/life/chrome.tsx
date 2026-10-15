import { LifeSectionNav } from "@/components/life/life-section-nav"
import { AppShell } from "@/components/shell/app-shell"
import type { SessionView } from "@/lib/data/session"

import { previewSession } from "../shell-session"

export function LifePreview({ children, session = previewSession }: { children: React.ReactNode; session?: SessionView }) {
  return (
    <AppShell session={session}>
      <div className="grid min-w-0 gap-5">
        <LifeSectionNav />
        {children}
      </div>
    </AppShell>
  )
}
