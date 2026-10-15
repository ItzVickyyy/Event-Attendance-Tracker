import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Loader2 } from "lucide-react"
import { AttendanceCorrectionsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AttendanceAdministrationPage() {
  const q = useQuery({
    queryKey: ["attendance-corrections"],
    queryFn: () =>
      AttendanceCorrectionsService.correctionsReadAttendanceCorrections({
        query: { skip: 0, limit: 1000 },
      }),
  })
  const rows = q.data?.data.data ?? []
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Attendance Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlled attendance corrections are kept outside ordinary Records.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Correction History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading correction history…
            </div>
          ) : q.isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="size-5 text-destructive" />
              <p className="font-medium">Unable to load correction history.</p>
              <p className="text-sm text-muted-foreground">
                Check your connection and permissions, then try again.
              </p>
              <Button
                variant="outline"
                onClick={() => void q.refetch()}
                disabled={q.isFetching}
              >
                {q.isFetching ? "Retrying…" : "Retry"}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No correction records.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Record</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Corrected By</th>
                  <th className="p-3">Old Status</th>
                  <th className="p-3">New Status</th>
                  <th className="p-3">Corrected At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3">Attendance record</td>
                    <td className="p-3">{r.reason}</td>
                    <td className="p-3">{r.corrected_by || "—"}</td>
                    <td className="p-3">{r.old_status || "—"}</td>
                    <td className="p-3">{r.new_status || "—"}</td>
                    <td className="p-3">
                      {r.corrected_at
                        ? new Date(r.corrected_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
