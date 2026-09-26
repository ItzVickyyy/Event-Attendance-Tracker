import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "@/components/Reconstruction/PlaceholderPage"

export const Route = createFileRoute("/_layout/sections/$sectionId")({
  component: SectionDetails,
  head: () => ({ meta: [{ title: "Section Details - Event Attendance Tracker" }] }),
})

function SectionDetails() {
  const { sectionId } = Route.useParams()

  return (
    <PlaceholderPage
      title="Section Details"
      description="Section information, students, student details, and section attendance will live under this route."
      detail={`Section ${sectionId} is a route-level placeholder. No student or attendance data is mocked in Phase 1.`}
    />
  )
}
