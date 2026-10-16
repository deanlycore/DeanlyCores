/** Production preview routes stay closed. Vercel preview deploys and local dev stay open. */
export function previewIsProduction(env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env) {
  if (env.VERCEL_ENV === "production") return true
  if (env.NODE_ENV === "production" && !env.VERCEL_ENV) return true
  return false
}

/** Schema test 21. The /preview guard returns 404 in production and passes otherwise. */
export function previewStatus(
  pathname: string,
  env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env,
): 404 | null {
  if (!pathname.startsWith("/preview")) return null
  if (previewIsProduction(env)) return 404
  return null
}
