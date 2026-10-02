import Image from "next/image"

export function LoopMark({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <Image
      src="/brand/deanly-loop-mark.png"
      alt=""
      width={size}
      height={size}
      priority={size >= 40}
      className={className ? `object-contain ${className}` : "object-contain"}
    />
  )
}
