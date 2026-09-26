import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "@/components/Reconstruction/PlaceholderPage"

export const Route = createFileRoute("/_layout/account")({
  component: Account,
  head: () => ({ meta: [{ title: "My Account - Event Attendance Tracker" }] }),
})

function Account() {
  return (
    <PlaceholderPage
      title="My Account"
      description="Your profile and security settings live here."
      detail="Phase 1 establishes the account entry point. Profile and security workflows remain unchanged until their reconstruction phase."
    />
  )
}
