import { createFileRoute } from "@tanstack/react-router"
import { StudentDetailsPage } from "@/components/Sections/StudentDetailsPage"

export const Route = createFileRoute("/_layout/sections/$sectionId/students/$studentId")({
  component: StudentDetails,
  head: () => ({ meta: [{ title: "Student Details - Event Attendance Tracker" }] }),
})

function StudentDetails() {
  const { studentId } = Route.useParams()
  return <StudentDetailsPage studentId={studentId} />
}
