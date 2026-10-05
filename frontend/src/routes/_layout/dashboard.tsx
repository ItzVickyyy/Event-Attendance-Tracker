import { createFileRoute } from "@tanstack/react-router"

import { OperationalDashboard } from "@/components/Dashboard/OperationalDashboard"
import { ClassRepresentativeDashboard } from "@/components/ClassRepresentative/Dashboard"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  const { user } = useAuth()
  return user?.role === "class_representative" ? <ClassRepresentativeDashboard /> : <OperationalDashboard />
}

export default Dashboard
