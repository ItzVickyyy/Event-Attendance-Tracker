import { createFileRoute } from "@tanstack/react-router"
import { SectionDetailsPage } from "@/components/Sections/SectionDetailsPage"

export const Route = createFileRoute("/_layout/sections/$sectionId")({
  component: SectionDetails,
  head: () => ({ meta: [{ title: "Section Details - Event Attendance Tracker" }] }),
})

function SectionDetails() {
  const { sectionId } = Route.useParams()
  return <SectionDetailsPage sectionId={sectionId} />
}
