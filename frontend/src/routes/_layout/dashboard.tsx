import { createFileRoute, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client"

import { OperationalDashboard } from "@/components/Dashboard/OperationalDashboard"
import { ClassRepresentativeDashboard } from "@/components/ClassRepresentative/Dashboard"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    const isDeveloper = user.is_developer || user.role === "developer"
    const hasOperationalRole = user.is_superuser || user.role === "super_admin" || user.role === "admin" || user.role === "class_representative"
    if (isDeveloper && !hasOperationalRole) throw redirect({ to: "/developer" })
  },
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  const { user } = useAuth()
  return user?.role === "class_representative" ? <ClassRepresentativeDashboard /> : <OperationalDashboard />
}

export default Dashboard
