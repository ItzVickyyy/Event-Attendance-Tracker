import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { EventDetailsPage } from "@/components/Events/EventDetailsPage"

export const Route = createFileRoute("/_layout/events/$eventId")({
  component: RouteComponent,
})

function RouteComponent() {
  const { eventId } = Route.useParams()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== `/events/${eventId}`) {
    return <Outlet />
  }

  return <EventDetailsPage eventId={eventId} />
}
