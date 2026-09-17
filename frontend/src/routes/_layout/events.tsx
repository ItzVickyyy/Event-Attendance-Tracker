import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Search } from "lucide-react"
import { Suspense, useState } from "react"

import { EventsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddEvent from "@/components/Events/AddEvent"
import { eventsColumns } from "@/components/Events/columns"
import PendingEvents from "@/components/Pending/PendingEvents"

function getEventsQueryOptions() {
  return {
    queryFn: async () =>
      (await EventsService.readEvents({ query: { skip: 0, limit: 1000 } }))
        .data,
    queryKey: ["events"],
  }
}

export const Route = createFileRoute("/_layout/events")({
  component: Events,
  head: () => ({
    meta: [
      {
        title: "Events - Event Attendance Tracker",
      },
    ],
  }),
})

function EventsTableContent({ search }: { search: string }) {
  const { data: eventsResponse } = useSuspenseQuery(getEventsQueryOptions())
  const events = eventsResponse.data

  let filtered = events
  if (search) {
    const pattern = search.toLowerCase()
    filtered = events.filter(
      (e: { event_name: string }) =>
        e.event_name.toLowerCase().includes(pattern),
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No events found</h3>
        <p className="text-muted-foreground">
          {search
            ? "Try a different search term"
            : "Add a new event to get started"}
        </p>
      </div>
    )
  }

  return <DataTable columns={eventsColumns} data={filtered} />
}

function Events() {
  const [search, setSearch] = useState("")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground">
            Manage events and attendance sessions
          </p>
        </div>
        <AddEvent />
      </div>
      <form
        className="flex-1 max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.currentTarget)
          setSearch((formData.get("search") as string) || "")
        }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="search"
            type="search"
            placeholder="Search by event name or organizer..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </form>
      <Suspense fallback={<PendingEvents />}>
        <EventsTableContent search={search} />
      </Suspense>
    </div>
  )
}

export default Events
