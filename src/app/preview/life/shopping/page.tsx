import { notFound } from "next/navigation"

import { ShoppingBoard } from "@/components/life/shopping-board"

import { LifePreview } from "../chrome"
import { previewShopping, previewToday } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewShopping() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <LifePreview>
      <ShoppingBoard rows={previewShopping} today={previewToday} />
    </LifePreview>
  )
}
