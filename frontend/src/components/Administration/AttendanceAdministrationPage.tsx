import { useQuery } from "@tanstack/react-query"
import { AttendanceCorrectionsService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AttendanceAdministrationPage() {
  const q = useQuery({
    queryKey: ["attendance-corrections"],
    queryFn: () => AttendanceCorrectionsService.correctionsReadAttendanceCorrections({ query: { skip: 0, limit: 1000 } }),
  })
  const rows = q.data?.data.data ?? []
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Attendance Administration</h1><p className="mt-1 text-sm text-muted-foreground">Controlled attendance corrections are kept outside ordinary Records.</p></div><Card><CardHeader><CardTitle className="text-base">Correction History</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Attendance</th><th className="p-3">Reason</th><th className="p-3">Corrected By</th><th className="p-3">Old Status</th><th className="p-3">New Status</th><th className="p-3">Corrected At</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-b"><td className="p-3 font-mono">{r.attendance_id}</td><td className="p-3">{r.reason}</td><td className="p-3">{r.corrected_by || "—"}</td><td className="p-3">{r.old_status || "—"}</td><td className="p-3">{r.new_status || "—"}</td><td className="p-3">{r.corrected_at ? new Date(r.corrected_at).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!q.isLoading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No correction records.</p>}</CardContent></Card></div>
}
