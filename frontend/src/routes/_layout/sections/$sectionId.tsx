import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { SectionDetailsPage } from "@/components/Sections/SectionDetailsPage"

export const Route = createFileRoute("/_layout/sections/$sectionId")({
  component: SectionDetails,
  head: () => ({
    meta: [{ title: "Section Details - Event Attendance Tracker" }],
  }),
})

function SectionDetails() {
  const { sectionId } = Route.useParams()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const pathSegments = pathname.split("/").filter(Boolean)
  if (pathSegments.length > 2) return <Outlet />
  return <SectionDetailsPage sectionId={sectionId} />
}
