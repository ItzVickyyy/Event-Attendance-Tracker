import { createFileRoute } from "@tanstack/react-router"
import { RecordsWorkspace } from "@/components/Records/RecordsWorkspace"

export const Route = createFileRoute("/_layout/records/incomplete")({ component: () => <RecordsWorkspace mode="incomplete" /> })
