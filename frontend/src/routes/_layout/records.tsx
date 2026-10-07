import { createFileRoute } from "@tanstack/react-router"
import { ClassRepresentativeRecordsWorkspace } from "@/components/ClassRepresentative/RecordsWorkspace"
import { RecordsWorkspace } from "@/components/Records/RecordsWorkspace"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/records")({
  component: () => {
    const { user } = useAuth()
    return user?.role === "class_representative" ? (
      <ClassRepresentativeRecordsWorkspace />
    ) : (
      <RecordsWorkspace />
    )
  },
  head: () => ({
    meta: [{ title: "Attendance Records - Event Attendance Tracker" }],
  }),
})
