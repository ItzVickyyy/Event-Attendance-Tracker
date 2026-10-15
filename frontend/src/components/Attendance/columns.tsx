import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Calendar, Clock, Edit } from "lucide-react"
import { useState } from "react"
import type { AttendancePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth from "@/hooks/useAuth"
import { AttendanceCorrectionDialog } from "./CorrectionDialog"

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
    cell: ({ row }) => {
      const timeIn = row.original.time_in
      return timeIn ? (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{format(new Date(timeIn), "p")}</span>
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
          <span>{format(new Date(timeOut), "p")}</span>
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
      if (!status) return <span className="text-muted-foreground">-</span>

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
          {status.replace(/_/g, " ")}
        </span>
      )
    },
  },
  {
    accessorKey: "scan_method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.original.scan_method
      if (!method) return <span className="text-muted-foreground">-</span>

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
        {row.original.scanned_by_name || (row.original.scanned_by ? "Unknown scanner" : "-")}
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
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const { user } = useAuth()
      const [isDialogOpen, setIsDialogOpen] = useState(false)
      const attendance = row.original

      const isAdmin = user?.role === "admin" || user?.role === "super_admin"

      if (!isAdmin) return null

      return (
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Edit className="h-4 w-4 mr-2" />
                Correct
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
                Correct Record
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AttendanceCorrectionDialog
            attendance={attendance}
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
          />
        </div>
      )
    },
  },
]
