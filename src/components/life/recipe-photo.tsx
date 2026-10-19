"use client"

import { useState } from "react"
import Image from "next/image"

import { CATALOG_PHOTO_HEIGHT, CATALOG_PHOTO_WIDTH } from "@/lib/life/catalog"

export function RecipePhoto({
  name,
  src,
  variant,
}: {
  name: string
  src: string | null
  variant: "card" | "detail"
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  const frame =
    variant === "card"
      ? "relative aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-surface-muted"
      : "relative aspect-[4/3] w-full max-h-[720px] max-w-[960px] overflow-hidden rounded-[16px] bg-surface-muted"

  return (
    <div className={frame} role={showImage ? undefined : "img"} aria-label={showImage ? undefined : name}>
      {showImage ? (
        <Image
          src={src as string}
          alt={name}
          fill
          sizes={variant === "card" ? "(min-width: 768px) 220px, 160px" : "(min-width: 960px) 960px, 100vw"}
          className="object-cover"
          style={{ maxWidth: CATALOG_PHOTO_WIDTH, maxHeight: CATALOG_PHOTO_HEIGHT }}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  )
}
