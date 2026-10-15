import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Calendar, Clock } from "lucide-react"
import type { AttendancePublic } from "@/client"

export const attendanceColumns: ColumnDef<AttendancePublic>[] = [
  {
    accessorKey: "person_name",
    header: "Attendee",
    cell: ({ row }) => (
      <div className="min-w-36">
        <p className="font-medium">
          {row.original.person_name || "Unknown attendee"}
        </p>
        {row.original.student_number && (
          <p className="text-xs text-muted-foreground">
            {row.original.student_number}
          </p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "event_name",
    header: "Event",
    cell: ({ row }) => row.original.event_name || "—",
  },
  {
    accessorKey: "time_in",
    header: "Time-In",
    cell: ({ row }) =>
      row.original.time_in ? (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {format(new Date(row.original.time_in), "p")}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "time_out",
    header: "Time-Out",
    cell: ({ row }) =>
      row.original.time_out ? (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {format(new Date(row.original.time_out), "p")}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status ? (
        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {row.original.status.replace(/_/g, " ")}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "scan_method",
    header: "Method",
    cell: ({ row }) =>
      row.original.scan_method ? (
        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {row.original.scan_method.toUpperCase()}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "scanned_by_name",
    header: "Scanned By",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.scanned_by_name ||
          (row.original.scanned_by ? "Unknown scanner" : "—")}
      </span>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Recorded",
    cell: ({ row }) =>
      row.original.created_at ? (
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {format(new Date(row.original.created_at), "PPpp")}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
]
