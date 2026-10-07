import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client"

export const Route = createFileRoute("/_layout/administration")({
  component: AdministrationLayout,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    if (!user.is_superuser && user.role !== "super_admin" && user.role !== "admin") {
      throw redirect({ to: user.is_developer || user.role === "developer" ? "/developer" : "/dashboard" })
    }
  },
})

function AdministrationLayout() {
  return <Outlet />
}
