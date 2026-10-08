import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/account")({
  component: () => <Outlet />,
  head: () => ({ meta: [{ title: "My Account - Event Attendance Tracker" }] }),
})
