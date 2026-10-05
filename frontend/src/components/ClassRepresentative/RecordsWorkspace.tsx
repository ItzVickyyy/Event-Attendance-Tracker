import { useQuery } from "@tanstack/react-query"
import { Download, ClipboardList, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { DataTable } from "@/components/Common/DataTable"
import { attendanceColumns } from "@/components/Attendance/recordsColumns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAcademicYear } from "@/context/AcademicYearContext"

export function ClassRepresentativeRecordsWorkspace() {
  const { activeAcademicYear } = useAcademicYear()
  const token = localStorage.getItem("access_token")
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = "Bearer " + token
  const query = useQuery({
    queryKey: ["class-representative-records", activeAcademicYear?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ skip: "0", limit: "1000", academic_year_id: activeAcademicYear!.id })
      const response = await fetch("/api/v1/attendance/?" + params, { headers })
      if (!response.ok) throw new Error("Unable to load attendance records")
      return response.json()
    },
    enabled: Boolean(activeAcademicYear),
  })
  const records = query.data?.data ?? []
  const exportRecords = async () => {
    const params = new URLSearchParams({ academic_year_id: activeAcademicYear!.id })
    const response = await fetch("/api/v1/attendance/export?" + params, { headers })
    if (!response.ok) { toast.error("Unable to export attendance records"); return }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "attendance_" + activeAcademicYear!.label + ".csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Attendance Records</h1><p className="mt-1 text-sm text-muted-foreground">Attendance for your assigned section only.</p></div><Button variant="outline" onClick={() => void exportRecords()}><Download />Export</Button></div>
    <Card><CardHeader><CardTitle>{activeAcademicYear?.label ?? "Academic Year"}</CardTitle></CardHeader><CardContent>
      {query.isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div> : records.length === 0 ? <div className="flex flex-col items-center py-12 text-center"><ClipboardList className="mb-3 size-8 text-muted-foreground" /><p className="font-medium">No attendance records</p></div> : <DataTable columns={attendanceColumns} data={records} />}
    </CardContent></Card>
  </div>
}
