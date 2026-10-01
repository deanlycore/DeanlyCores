"use server"

import { revalidatePath } from "next/cache"

import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export async function createHousehold(formData: FormData) {
  if (!isSupabaseConfigured()) return
  const name = String(formData.get("name") ?? "").trim() || "DeanFamily"
  const supabase = await createClient()
  await supabase.rpc("create_household", { household_name: name })
  revalidatePath("/home")
}
