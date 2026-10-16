"use client"

import { STALE_CHANGED, STALE_KEEP_MINE, STALE_USE_THEIRS } from "@/lib/life/shopping"

export function StaleChoice({ onUseTheirs, onKeepMine }: { onUseTheirs: () => void; onKeepMine: () => void }) {
  return (
    <p className="mt-1 text-[13px] text-muted-foreground" onClick={(event) => event.stopPropagation()}>
      {STALE_CHANGED}{" "}
      <button type="button" className="text-muted-foreground" onClick={onUseTheirs}>
        {STALE_USE_THEIRS}
      </button>
      {" | "}
      <button type="button" className="text-muted-foreground" onClick={onKeepMine}>
        {STALE_KEEP_MINE}
      </button>
    </p>
  )
}
