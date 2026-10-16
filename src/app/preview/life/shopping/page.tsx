import { notFound } from "next/navigation"

import { previewIsProduction } from "@/lib/preview-access"

import { ShoppingBoard } from "@/components/life/shopping-board"

import { LifePreview } from "../chrome"
import { previewPantry, previewShopping, previewShoppingLists, previewToday } from "../sample"

export const dynamic = "force-dynamic"

export default async function PreviewShopping({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; stale?: string }>
}) {
  if (previewIsProduction()) notFound()
  const params = await searchParams
  return (
    <LifePreview>
      <ShoppingBoard
        rows={previewShopping}
        lists={previewShoppingLists}
        pantry={previewPantry}
        today={previewToday}
        currency="USD"
        homePrompt={params.prompt === "1"}
        promptName={params.prompt === "1" ? "Tomatoes" : undefined}
        staleItemId={params.stale === "1" ? "tomatoes" : null}
      />
    </LifePreview>
  )
}
