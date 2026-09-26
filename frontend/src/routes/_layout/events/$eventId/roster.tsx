import { createFileRoute } from "@tanstack/react-router"
import { EventRosterPage } from "@/components/Events/EventRosterPage"

export const Route = createFileRoute("/_layout/events/$eventId/roster")({ component: RouteComponent })
function RouteComponent() { const { eventId } = Route.useParams(); return <EventRosterPage eventId={eventId} /> }
