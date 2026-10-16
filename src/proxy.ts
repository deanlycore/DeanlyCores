import { NextResponse, type NextRequest } from "next/server"

import { previewIsProduction } from "@/lib/preview-access"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/preview") && previewIsProduction()) {
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404 })
  }
  return updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
