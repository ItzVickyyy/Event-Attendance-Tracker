import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/administration/roles")({
  beforeLoad: () => {
    throw redirect({ to: "/administration" })
  },
})
