import type { SessionView } from "@/lib/data/session"

export const previewSession: SessionView = {
  configured: true,
  email: "alex@example.com",
  userId: "00000000-0000-0000-0000-000000000001",
  displayName: "Alex",
  avatarUrl: null,
  householdId: "00000000-0000-0000-0000-000000000010",
  householdName: "My household",
  role: "owner",
  members: [
    { userId: "1", role: "owner", displayName: "Alex", avatarUrl: null },
    { userId: "2", role: "adult", displayName: "Sam", avatarUrl: null },
  ],
}
