import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Calendar, Clock, ScanLine } from "lucide-react"
import type { EventPublic } from "@/client"
import { Button } from "@/components/ui/button"
import DeleteEvent from "./DeleteEvent"
import EditEvent from "./EditEvent"

export const eventsColumns: ColumnDef<EventPublic>[] = [
  { accessorKey: "event_name", header: "Event Name", cell: ({ row }) => <Link className="font-medium hover:underline" to="/events/$eventId" params={{ eventId: row.original.id }}>{row.original.event_name}</Link> },
  { accessorKey: "event_date", header: "Date", cell: ({ row }) => <div className="flex items-center gap-1"><Calendar className="h-4 w-4 text-muted-foreground" /><span>{row.original.event_date}</span></div> },
  { accessorKey: "start_time", header: "Start", cell: ({ row }) => <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" /><span>{row.original.start_time || "-"}</span></div> },
  { accessorKey: "end_time", header: "End", cell: ({ row }) => <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" /><span>{row.original.end_time || "-"}</span></div> },
  { accessorKey: "attendance_mode", header: "Mode", cell: ({ row }) => <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{row.original.attendance_mode === "time_in_time_out" ? "Time-In + Time-Out" : "Time-In Only"}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => { const status = row.original.status || "draft"; return <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{status.charAt(0).toUpperCase() + status.slice(1)}</span> } },
  { id: "actions", header: "Actions", cell: ({ row }) => <div className="flex items-center gap-2"><Button variant="outline" size="sm" asChild><Link to="/events/$eventId" params={{ eventId: row.original.id }}>Details</Link></Button><Button variant="outline" size="sm" asChild><Link to="/scanner" search={{ event_id: row.original.id }}><ScanLine className="h-4 w-4 mr-1" />Scan</Link></Button><EditEvent event={row.original} /><DeleteEvent event={row.original} /></div> },
]
