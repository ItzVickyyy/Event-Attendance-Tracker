import { createFileRoute } from "@tanstack/react-router"
import { SectionStudentsPage } from "@/components/Sections/SectionStudentsPage"

export const Route = createFileRoute("/_layout/sections/$sectionId/students")({
  component: SectionStudents,
  head: () => ({ meta: [{ title: "Students - Event Attendance Tracker" }] }),
})

function SectionStudents() {
  const { sectionId } = Route.useParams()
  return <SectionStudentsPage sectionId={sectionId} />
}
