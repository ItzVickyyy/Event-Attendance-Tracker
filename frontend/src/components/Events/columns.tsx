import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Calendar, Clock, ScanLine } from "lucide-react"

import type { EventPublic } from "@/client"
import { Button } from "@/components/ui/button"
import DeleteEvent from "./DeleteEvent"
import EditEvent from "./EditEvent"
import EventRosterDialog from "./EventRosterDialog"

export const eventsColumns: ColumnDef<EventPublic>[] = [
  {
    accessorKey: "event_name",
    header: "Event Name",
    cell: ({ row }) => (
      <div className="font-medium">{row.original.event_name}</div>
    ),
  },
  {
    accessorKey: "event_date",
    header: "Date",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{row.original.event_date}</span>
      </div>
    ),
  },
  {
    accessorKey: "start_time",
    header: "Start",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{row.original.start_time || "-"}</span>
      </div>
    ),
  },
  {
    accessorKey: "end_time",
    header: "End",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{row.original.end_time || "-"}</span>
      </div>
    ),
  },
  {
    accessorKey: "attendance_mode",
    header: "Mode",
    cell: ({ row }) => {
      const mode = row.original.attendance_mode
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            mode === "time_in_time_out"
              ? "bg-blue-100 text-blue-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {mode === "time_in_time_out" ? "Time-In + Time-Out" : "Time-In Only"}
        </span>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status || "draft"
      const colors: Record<string, string> = {
        draft: "bg-gray-100 text-gray-800",
        open: "bg-green-100 text-green-800",
        closed: "bg-red-100 text-red-800",
      }
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            colors[status] || "bg-gray-100 text-gray-800"
          }`}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      )
    },
  },

  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <EventRosterDialog event={row.original} />
        <Button variant="outline" size="sm" asChild>
          <Link to="/scanner" search={{ event_id: row.original.id }}>
            <ScanLine className="h-4 w-4 mr-1" />
            Scan
          </Link>
        </Button>
        <EditEvent event={row.original} />
        <DeleteEvent event={row.original} />
      </div>
    ),
  },
]
