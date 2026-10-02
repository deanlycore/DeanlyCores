import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/auth-forms"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export const metadata: Metadata = { title: { absolute: "Deanly Tracking" } }

export default function LoginPage() {
  return <LoginForm configured={isSupabaseConfigured()} />
}
