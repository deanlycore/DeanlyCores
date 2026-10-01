import type { Metadata } from "next"

import { SectionPage } from "@/components/shell/section-page"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <SectionPage href="/settings" />
  )
}
