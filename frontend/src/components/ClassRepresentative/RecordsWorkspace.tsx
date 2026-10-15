import { useInfiniteQuery } from "@tanstack/react-query"
import { AlertCircle, ClipboardList, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { AttendancePublic } from "@/client"
import { attendanceColumns } from "@/components/Attendance/recordsColumns"
import { DataTable } from "@/components/Common/DataTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAcademicYear } from "@/context/AcademicYearContext"

const PAGE_SIZE = 100

type AttendancePage = {
  data: AttendancePublic[]
  count: number
}

export function ClassRepresentativeRecordsWorkspace() {
  const { activeAcademicYear } = useAcademicYear()
  const token = localStorage.getItem("access_token")
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const query = useInfiniteQuery({
    queryKey: ["class-representative-records", activeAcademicYear?.id],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<AttendancePage> => {
      if (!activeAcademicYear) return { data: [], count: 0 }
      const headersWithScope = {
        ...headers,
        "X-Academic-Year-ID": activeAcademicYear.id,
      }
      const params = new URLSearchParams({
        skip: String(pageParam),
        limit: String(PAGE_SIZE),
        academic_year_id: activeAcademicYear.id,
      })
      const response = await fetch(`/api/v1/attendance/?${params}`, {
        headers: headersWithScope,
      })
      if (!response.ok) throw new Error("Unable to load attendance records")
      return response.json()
    },
    getNextPageParam: (lastPage, pages) => {
      const loadedCount = pages.reduce(
        (total, page) => total + page.data.length,
        0,
      )
      return loadedCount < lastPage.count ? loadedCount : undefined
    },
    enabled: Boolean(activeAcademicYear),
  })

  const attendancePages = query.data?.pages ?? []
  const records = attendancePages.flatMap((page) => page.data)
  const totalRecords = attendancePages[attendancePages.length - 1]?.count ?? 0

  const exportRecords = async () => {
    if (!activeAcademicYear) return
    try {
      const headersWithScope = {
        ...headers,
        "X-Academic-Year-ID": activeAcademicYear.id,
      }
      const params = new URLSearchParams({
        academic_year_id: activeAcademicYear.id,
      })
      const response = await fetch(`/api/v1/attendance/export?${params}`, {
        headers: headersWithScope,
      })
      if (!response.ok) {
        throw new Error("Unable to export attendance records")
      }
      const blob = await response.blob()
      if (!blob.size) {
        toast.info("No attendance data to export")
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `attendance_${activeAcademicYear.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success("Attendance exported successfully")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to export attendance records",
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Attendance Records
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance for your assigned section only.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void exportRecords()}
          disabled={!activeAcademicYear}
        >
          <Download />
          Export
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{activeAcademicYear?.label ?? "Academic Year"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!activeAcademicYear ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Select an academic year to view attendance records.
            </div>
          ) : query.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin" />
            </div>
          ) : query.isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <p className="font-medium">Unable to load attendance records</p>
              <p className="text-sm text-muted-foreground">
                Check your connection and account permissions, then try again.
              </p>
              <Button
                variant="outline"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                Retry
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <ClipboardList className="mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">No attendance records</p>
            </div>
          ) : (
            <>
              <DataTable columns={attendanceColumns} data={records} />
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Loaded {records.length.toLocaleString()} of{" "}
                  {totalRecords.toLocaleString()} attendance records
                </p>
                {query.hasNextPage && (
                  <Button
                    variant="outline"
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? (
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
        </CardContent>
      </Card>
    </div>
  )
}
