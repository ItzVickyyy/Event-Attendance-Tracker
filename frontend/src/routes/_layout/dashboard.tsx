import { createFileRoute } from "@tanstack/react-router"

import { OperationalDashboard } from "@/components/Dashboard/OperationalDashboard"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  return <OperationalDashboard />
}

export default Dashboard
