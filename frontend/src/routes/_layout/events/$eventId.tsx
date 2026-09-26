import { createFileRoute } from "@tanstack/react-router"
import { EventDetailsPage } from "@/components/Events/EventDetailsPage"

export const Route = createFileRoute("/_layout/events/$eventId")({ component: RouteComponent })

function RouteComponent() {
  const { eventId } = Route.useParams()
  return <EventDetailsPage eventId={eventId} />
}
