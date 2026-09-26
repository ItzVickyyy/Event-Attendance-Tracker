import { createFileRoute } from "@tanstack/react-router"
import { RecordsWorkspace } from "@/components/Records/RecordsWorkspace"

export const Route = createFileRoute("/_layout/records")({
  component: () => <RecordsWorkspace />,
  head: () => ({ meta: [{ title: "Attendance Records - Event Attendance Tracker" }] }),
})
