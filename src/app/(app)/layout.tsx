import { redirect } from "next/navigation"

import { AppShell } from "@/components/shell/app-shell"
import { getSessionView } from "@/lib/data/session"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionView()
  if (!session.email) redirect("/login")

  return <AppShell session={session}>{children}</AppShell>
}
