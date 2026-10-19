"use client"

import { STALE_CHANGED, STALE_KEEP_MINE, STALE_USE_THEIRS } from "@/lib/life/shopping"

const choice = "inline-flex min-h-12 items-center rounded-[10px] border border-border bg-surface-muted px-4 text-[13px] text-muted-foreground"

export function StaleChoice({ onUseTheirs, onKeepMine }: { onUseTheirs: () => void; onKeepMine: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      <p className="w-full text-[13px] text-muted-foreground">{STALE_CHANGED}</p>
      <button type="button" className={choice} onClick={onUseTheirs}>
        {STALE_USE_THEIRS}
      </button>
      <button type="button" className={choice} onClick={onKeepMine}>
        {STALE_KEEP_MINE}
      </button>
    </div>
  )
}
