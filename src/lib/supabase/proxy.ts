import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { REMEMBER_COOKIE, withRemember } from "@/lib/supabase/cookies"
import { isSupabaseConfigured, requireSupabaseEnv } from "@/lib/supabase/env"

const PUBLIC_PREFIXES = ["/auth"]
const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password"])

function isPublic(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

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

  let signedIn = false
  try {
    const { data } = await supabase.auth.getClaims()
    signedIn = Boolean(data?.claims)
  } catch {
    signedIn = false
  }

  const { pathname } = request.nextUrl
  const authEntry = pathname === "/login" || pathname === "/forgot-password" || pathname === "/"

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    const redirect = NextResponse.redirect(url)
    copyCookies(supabaseResponse, redirect)
    return redirect
  }

  if (signedIn && authEntry) {
    const url = request.nextUrl.clone()
    url.pathname = "/home"
    const redirect = NextResponse.redirect(url)
    copyCookies(supabaseResponse, redirect)
    return redirect
  }

  return supabaseResponse
}
