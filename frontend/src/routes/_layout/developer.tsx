import { createFileRoute, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client"
import { DeveloperSystemDashboard } from "@/components/Developer/DeveloperSystemDashboard"

export const Route = createFileRoute("/_layout/developer")({
  component: DeveloperSystemDashboard,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    if (!(user.is_developer || user.role === "developer")) {
      throw redirect({ to: "/dashboard" })
    }
  },
  head: () => ({ meta: [{ title: "Developer System Dashboard - Event Attendance Tracker" }] }),
})
