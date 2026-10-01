"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const TIMEZONE_COOKIE = "deanly-tz"

export function TimezoneSync() {
  const router = useRouter()
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const current = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${TIMEZONE_COOKIE}=`))
      ?.split("=")[1]
    if (decodeURIComponent(current ?? "") === timeZone) return
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [router])
  return null
}
