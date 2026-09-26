import { createFileRoute } from "@tanstack/react-router"
import { RecordsWorkspace } from "@/components/Records/RecordsWorkspace"

export const Route = createFileRoute("/_layout/records/export")({ component: () => <RecordsWorkspace mode="export" /> })
