import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "@/components/Reconstruction/PlaceholderPage"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Operational overview for events, attendance activity, and synchronization status."
      detail="Dashboard business metrics are implemented in R3. R2 establishes the canonical route and landing point."
    />
  )
}

export default Dashboard
