import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { SectionStudentsPage } from "@/components/Sections/SectionStudentsPage"

export const Route = createFileRoute("/_layout/sections/$sectionId/students")({
  component: SectionStudents,
  head: () => ({ meta: [{ title: "Students - Event Attendance Tracker" }] }),
})

function SectionStudents() {
  const { sectionId } = Route.useParams()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const pathSegments = pathname.split("/").filter(Boolean)

  // The student details route is nested under this route. Render its child
  // instead of leaving the section roster visible on the details URL.
  if (pathSegments.length > 3) return <Outlet />

  return <SectionStudentsPage sectionId={sectionId} />
}
