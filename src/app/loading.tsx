import { Wordmark } from "@/components/brand/wordmark"

export default function Loading() {
  return (
    <div className="grid min-h-full place-items-center bg-background p-8">
      <div className="grid justify-items-center gap-3">
        <Wordmark size="lg" />
        <p className="text-sm text-muted-foreground">Keep life together, effortlessly.</p>
      </div>
    </div>
  )
}
