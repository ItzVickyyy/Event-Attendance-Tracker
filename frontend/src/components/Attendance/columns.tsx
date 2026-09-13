import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Calendar, Clock } from "lucide-react"

import type { AttendancePublic } from "@/client"

export const attendanceColumns: ColumnDef<AttendancePublic>[] = [
  {
    accessorKey: "student_id",
    header: "Student",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.student_id}</p>
        <p className="text-sm text-muted-foreground">
          Event: {row.original.event_id}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "time_in",
    header: "Time-In",
    cell: ({ row }) => {
      const timeIn = row.original.time_in
      return timeIn ? (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{format(new Date(timeIn), "PPpp")}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    },
  },
  {
    accessorKey: "time_out",
    header: "Time-Out",
    cell: ({ row }) => {
      const timeOut = row.original.time_out
      return timeOut ? (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{format(new Date(timeOut), "PPpp")}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      const colors: Record<string, string> = {
        present: "bg-green-100 text-green-800",
        time_in_only: "bg-blue-100 text-blue-800",
        completed: "bg-gray-100 text-gray-800",
        incomplete: "bg-amber-100 text-amber-800",
      }
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            colors[status] || "bg-gray-100 text-gray-800"
          }`}
        >
          {status.replace("_", " ")}
        </span>
      )
    },
  },
  {
    accessorKey: "scan_method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.original.scan_method
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            method === "nfc"
              ? "bg-blue-100 text-blue-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {method.toUpperCase()}
        </span>
      )
    },
  },
  {
    accessorKey: "scanned_by",
    header: "Scanned By",
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">
        {row.original.scanned_by || "-"}
      </div>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Recorded",
    cell: ({ row }) => {
      const created = row.original.created_at
      return created ? (
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{format(new Date(created), "PPpp")}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    },
  },
]
