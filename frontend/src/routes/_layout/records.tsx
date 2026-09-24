import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Download, Loader2 } from "lucide-react"
import { Suspense, useState } from "react"
import { toast } from "sonner"

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
        await AttendanceService.readAttendances({
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
  const [isExporting, setIsExporting] = useState(false)
  const selectedEvent = events.find(
    (e: { id: string; event_name: string }) => e.id === eventId,
  )

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const token = localStorage.getItem("access_token")
      const params = new URLSearchParams()
      if (eventId) {
        params.append("event_id", eventId)
      }
      const queryString = params.toString() ? `?${params.toString()}` : ""
      const url = `${import.meta.env.VITE_API_URL || ""}/api/v1/attendance/export${queryString}`

      const response = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let detail = "Failed to export attendance"
        try {
          const parsed = JSON.parse(errorText)
          if (parsed.detail) detail = parsed.detail
        } catch {
          // use default
        }
        toast.error(detail)
        return
      }

      const blob = await response.blob()
      if (blob.size === 0) {
        toast.info("No attendance data to export")
        return
      }

      // Extract filename from header if present
      const disposition = response.headers.get("content-disposition")
      let filename = `attendance_${selectedEvent?.event_name?.replace(/\s+/g, "_").toLowerCase() || "all"}.csv`
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/)
        if (match?.[1]) {
          filename = match[1]
        }
      }

      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)
      toast.success("Attendance exported successfully")
    } catch (error: any) {
      toast.error(error.message || "Failed to export attendance")
    } finally {
      setIsExporting(false)
    }
  }

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
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Export"}
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
