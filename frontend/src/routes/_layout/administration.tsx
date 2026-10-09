import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/administration")({
  component: AdministrationLayout,
})

function AdministrationLayout() {
  return <Outlet />
}
