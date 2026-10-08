import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/account")({
  component: AccountLayout,
  head: () => ({ meta: [{ title: "My Account - Event Attendance Tracker" }] }),
})

function AccountLayout() {
  return <Outlet />
}
