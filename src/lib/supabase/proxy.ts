import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { REMEMBER_COOKIE, withRemember } from "@/lib/supabase/cookies"
import { isSupabaseConfigured, requireSupabaseEnv } from "@/lib/supabase/env"
import { authRedirectTarget, isPublic } from "@/lib/supabase/redirects"

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie)
  })
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    if (isPublic(request.nextUrl.pathname)) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })
  const { url, key } = requireSupabaseEnv()
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0"

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, withRemember(options, remember))
        })
        Object.entries(headers).forEach(([header, value]) => {
          supabaseResponse.headers.set(header, value)
        })
      },
    },
  })

  // getClaims() only verifies the JWT signature. A signed-out or revoked
  // session still looks signed in, while the app layout's getUser() does not,
  // so /login and /home redirect to each other. getUser() uses the same check
  // and, on session_not_found, clears the dead cookies here where Set-Cookie
  // can be written. Server Components cannot.
  let signedIn = false
  try {
    const { data } = await supabase.auth.getUser()
    signedIn = Boolean(data.user?.email)
  } catch {
    signedIn = false
  }

  const destination = authRedirectTarget(request.nextUrl.pathname, signedIn)
  if (!destination) return supabaseResponse

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = destination
  const redirect = NextResponse.redirect(redirectUrl)
  copyCookies(supabaseResponse, redirect)
  return redirect
}
