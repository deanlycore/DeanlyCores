import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { REMEMBER_COOKIE, withRemember } from "@/lib/supabase/cookies"
import { requireSupabaseEnv } from "@/lib/supabase/env"

export async function createClient(options?: { remember?: boolean }) {
  const { url, key } = requireSupabaseEnv()
  const cookieStore = await cookies()
  const remember =
    options?.remember ?? cookieStore.get(REMEMBER_COOKIE)?.value !== "0"

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, withRemember(cookieOptions, remember))
          })
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  })
}
