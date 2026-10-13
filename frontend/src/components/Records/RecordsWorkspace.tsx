import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertCircle,
  ClipboardList,
  Download,
  History,
  Loader2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  AttendanceService,
  EventsService,
  type AttendancePublic,
  type EventPublic,
} from "@/client"
import { attendanceColumns } from "@/components/Attendance/recordsColumns"
import { DataTable } from "@/components/Common/DataTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAcademicYear } from "@/context/AcademicYearContext"

const PAGE_SIZE = 100

export function RecordsWorkspace({
  mode = "records",
}: {
  mode?: "records" | "history" | "incomplete" | "export"
}) {
  const [eventId, setEventId] = useState<string>("all")
  const { activeAcademicYear } = useAcademicYear()
  const academicYearId = activeAcademicYear?.id

  const eventsQuery = useQuery({
    queryKey: ["records-events", academicYearId],
    queryFn: async () => {
      if (!academicYearId) return []
      const firstPage = await EventsService.readEvents({
        query: {
          skip: 0,
          limit: PAGE_SIZE,
          academic_year_id: academicYearId,
        },
      })
      const events = [...firstPage.data.data]
      for (let skip = PAGE_SIZE; skip < firstPage.data.count; skip += PAGE_SIZE) {
        const page = await EventsService.readEvents({
          query: {
            skip,
            limit: PAGE_SIZE,
            academic_year_id: academicYearId,
          },
        })
        events.push(...page.data.data)
      }
      return events
    },
    enabled: Boolean(academicYearId),
  })

  const attendanceQuery = useInfiniteQuery({
    queryKey: ["records-attendance", eventId, academicYearId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!academicYearId) {
        return { data: [] as AttendancePublic[], count: 0 }
      }
      const response = await AttendanceService.readAttendances({
        query: {
          skip: pageParam,
          limit: PAGE_SIZE,
          academic_year_id: academicYearId,
          ...(eventId === "all" ? {} : { event_id: eventId }),
        },
      })
      return response.data
    },
    getNextPageParam: (lastPage, pages) => {
      const loadedCount = pages.reduce((total, page) => total + page.data.length, 0)
      return loadedCount < lastPage.count ? loadedCount : undefined
    },
    enabled: Boolean(academicYearId),
  })

  const events: EventPublic[] = eventsQuery.data ?? []
  const allAttendance: AttendancePublic[] =
    attendanceQuery.data?.pages.flatMap((page) => page.data) ?? []
  const attendancePages = attendanceQuery.data?.pages ?? []
  const totalAttendance =
    attendancePages.length > 0
      ? attendancePages[attendancePages.length - 1].count
      : 0
  const attendance =
    mode === "incomplete"
      ? allAttendance.filter(
          (record) =>
            record.status === "incomplete" ||
            (record.time_in && !record.time_out),
        )
      : allAttendance
  const selectedEvent = events.find((event) => event.id === eventId)

  async function exportAttendance() {
    try {
      const params = new URLSearchParams()
      if (eventId !== "all") params.set("event_id", eventId)
      if (academicYearId) params.set("academic_year_id", academicYearId)
      const baseUrl = import.meta.env.VITE_API_URL ?? ""
      const response = await fetch(
        `${baseUrl}/api/v1/attendance/export${params.toString() ? `?${params}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const detail =
          body && typeof body === "object" && "detail" in body
            ? (body as { detail?: unknown }).detail
            : undefined
        throw new Error(
          typeof detail === "string"
            ? detail
            : `Failed to export attendance (${response.status})`,
        )
      }
      const blob = await response.blob()
      if (!blob.size) {
        toast.info("No attendance data to export")
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `attendance_${selectedEvent?.event_name?.replace(/\s+/g, "_").toLowerCase() || "all"}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success("Attendance exported successfully")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export attendance",
      )
    }
  }

  const title =
    mode === "history"
      ? "Attendance History"
      : mode === "incomplete"
        ? "Incomplete Attendance"
        : mode === "export"
          ? "Export / Print"
          : "Attendance Records"
  const description =
    mode === "incomplete"
      ? "Records where a student tapped in but has no recorded time-out."
      : mode === "history"
        ? "Historical attendance records with event and attendance context."
        : mode === "export"
          ? "Export attendance records using the project's supported CSV export."
          : "Operational attendance records from the existing attendance API."

  const queryFailed = eventsQuery.isError || attendanceQuery.isError
  const retryQueries = () => {
    if (eventsQuery.isError) void eventsQuery.refetch()
    if (attendanceQuery.isError) void attendanceQuery.refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.event_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/records/history">
              <History />
              History
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/records/incomplete">
              <AlertCircle />
              Incomplete
            </Link>
          </Button>
          <Button
            onClick={exportAttendance}
            disabled={attendanceQuery.isLoading || !academicYearId}
          >
            <Download />
            Export
          </Button>
        </div>
      </div>
      {queryFailed ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="font-medium">Unable to load attendance records.</p>
            <p className="text-sm text-muted-foreground">
              Check your connection and account permissions, then try again.
            </p>
            <Button
              variant="outline"
              onClick={retryQueries}
              disabled={eventsQuery.isFetching || attendanceQuery.isFetching}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : attendanceQuery.isLoading || eventsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" />
            Loading attendance records…
          </CardContent>
        </Card>
      ) : attendance.length === 0 && !attendanceQuery.hasNextPage ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No attendance records</p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no records matching the selected view.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <DataTable columns={attendanceColumns} data={attendance} />
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Loaded {allAttendance.length.toLocaleString()} of{" "}
              {totalAttendance.toLocaleString()} attendance records
              {mode === "incomplete"
                ? `. ${attendance.length.toLocaleString()} loaded records match the incomplete view.`
                : "."}
            </p>
            {attendanceQuery.hasNextPage && (
              <Button
                variant="outline"
                onClick={() => void attendanceQuery.fetchNextPage()}
                disabled={attendanceQuery.isFetchingNextPage}
              >
                {attendanceQuery.isFetchingNextPage ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Loading more…
                  </>
                ) : (
                  "Load more records"
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
