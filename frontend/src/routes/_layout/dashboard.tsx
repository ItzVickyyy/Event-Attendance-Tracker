import { createFileRoute, redirect } from "@tanstack/react-router"

import { UsersService } from "@/client"
import { OperationalDashboard } from "@/components/Dashboard/OperationalDashboard"
import { ClassRepresentativeDashboard } from "@/components/ClassRepresentative/Dashboard"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    if (
      user.is_developer &&
      !user.is_superuser &&
      user.role !== "admin" &&
      user.role !== "super_admin"
    ) {
      throw redirect({ to: "/developer" })
    }
  },
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  const { user } = useAuth()
  return user?.role === "class_representative" ? (
    <ClassRepresentativeDashboard />
  ) : (
    <OperationalDashboard />
  )
}

export default Dashboard
