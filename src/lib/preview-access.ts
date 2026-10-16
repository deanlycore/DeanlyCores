/** Production preview routes stay closed. Vercel preview deploys and local dev stay open. */
export function previewIsProduction(env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env) {
  if (env.VERCEL_ENV === "production") return true
  if (env.NODE_ENV === "production" && !env.VERCEL_ENV) return true
  return false
}
