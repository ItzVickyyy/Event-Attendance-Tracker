import { createFileRoute } from "@tanstack/react-router"
import { EventRegistrationPage } from "@/components/Events/EventRegistrationPage"

export const Route = createFileRoute("/_layout/events/$eventId/registration")({ component: RouteComponent })
function RouteComponent() { const { eventId } = Route.useParams(); return <EventRegistrationPage eventId={eventId} /> }
