import { createFileRoute } from "@tanstack/react-router"
import { AuditLogsPage } from "@/components/Administration/AuditLogsPage"
export const Route = createFileRoute("/_layout/administration/audit-logs")({ component: AuditLogsPage })
