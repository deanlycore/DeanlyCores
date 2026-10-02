import type { SessionView } from "@/lib/data/session"

export const previewSession: SessionView = {
  configured: true,
  email: "alex@deanly.test",
  userId: "00000000-0000-0000-0000-000000000001",
  displayName: "Alex Dean",
  avatarUrl: null,
  householdId: "00000000-0000-0000-0000-000000000010",
  householdName: "DeanFamily",
  role: "owner",
  members: [
    { userId: "1", role: "owner", displayName: "Alex Dean", avatarUrl: null },
    { userId: "2", role: "member", displayName: "Sam Dean", avatarUrl: null },
  ],
}
