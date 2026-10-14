import { createFileRoute } from "@tanstack/react-router"
import { StudentDetailsPage } from "@/components/Sections/StudentDetailsPage"

export const Route = createFileRoute(
  "/_layout/sections/$sectionId/students/$studentId",
)({
  component: StudentDetails,
  validateSearch: (search: Record<string, unknown>) => ({
    from: search.from === "search" ? ("search" as const) : ("section" as const),
  }),
  head: () => ({
    meta: [{ title: "Student Details - Event Attendance Tracker" }],
  }),
})

function StudentDetails() {
  const { sectionId, studentId } = Route.useParams()
  const { from } = Route.useSearch()
  return (
    <StudentDetailsPage
      sectionId={sectionId}
      studentId={studentId}
      returnToSearch={from === "search"}
    />
  )
}
