import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Download } from "lucide-react"
import { Suspense, useState } from "react"

import { AttendanceService, EventsService } from "@/client"
import { attendanceColumns } from "@/components/Attendance/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingAttendance from "@/components/Pending/PendingAttendance"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function getEventsQueryOptions() {
  return {
    queryFn: async () =>
      (await EventsService.readEvents({ query: { skip: 0, limit: 1000 } }))
        .data,
    queryKey: ["events"],
  }
}

function getAttendanceQueryOptions(eventId?: string) {
  return {
    queryFn: async () =>
      (
        await AttendanceService.readAttendance({
          query: { event_id: eventId, skip: 0, limit: 1000 },
        })
      ).data,
    queryKey: ["attendance", eventId],
  }
}

export const Route = createFileRoute("/_layout/records")({
  component: Records,
  head: () => ({
    meta: [
      {
        title: "Attendance Records - Event Attendance Tracker",
      },
    ],
  }),
})

function RecordsTableContent({ eventId }: { eventId?: string }) {
  const { data: attendance } = useSuspenseQuery(
    getAttendanceQueryOptions(eventId),
  )

  if (attendance.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No attendance records</h3>
        <p className="text-muted-foreground">
          {eventId
            ? "No records for this event yet"
            : "Select an event to view its records"}
        </p>
      </div>
    )
  }

  return <DataTable columns={attendanceColumns} data={attendance.data} />
}

function Records() {
  const { data: eventsResponse } = useSuspenseQuery(getEventsQueryOptions())
  const events = eventsResponse.data
  const [eventId, setEventId] = useState<string | undefined>(undefined)
  const selectedEvent = events.find(
    (e: { id: string; event_name: string }) => e.id === eventId,
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance Records
          </h1>
          <p className="text-muted-foreground">
            {selectedEvent
              ? `Records for ${selectedEvent.event_name}`
              : "View and manage attendance records"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={eventId || ""}
            onValueChange={(v) => setEventId(v || undefined)}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e: { id: string; event_name: string }) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.event_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>
      <Suspense fallback={<PendingAttendance />}>
        <RecordsTableContent eventId={eventId} />
      </Suspense>
    </div>
  )
}

export default Records
