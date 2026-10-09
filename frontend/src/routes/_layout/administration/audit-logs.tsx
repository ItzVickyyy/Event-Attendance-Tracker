import { createFileRoute, redirect } from "@tanstack/react-router"

import { UsersService } from "@/client"
import { AuditLogsPage } from "@/components/Administration/AuditLogsPage"

export const Route = createFileRoute("/_layout/administration/audit-logs")({
  component: AuditLogsPage,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    const canReviewAuditLogs =
      user.is_superuser ||
      user.role === "super_admin" ||
      user.role === "admin" ||
      user.is_developer

    if (!canReviewAuditLogs) {
      throw redirect({ to: user.is_developer ? "/developer" : "/dashboard" })
    }
  },
  head: () => ({
    meta: [{ title: "Audit Logs - Event Attendance Tracker" }],
  }),
})
