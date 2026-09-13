import type { ColumnDef } from "@tanstack/react-table"
import { UserCheck, UserX } from "lucide-react"

import type { StudentPublic } from "@/client"
import DeleteStudent from "./DeleteStudent"
import EditStudent from "./EditStudent"

export const studentsColumns: ColumnDef<StudentPublic>[] = [
  {
    accessorKey: "student_number",
    header: "Student Number",
    cell: ({ row }) => (
      <div className="font-mono text-sm">{row.original.student_number}</div>
    ),
  },
  {
    accessorKey: "last_name",
    header: "Last Name",
    cell: ({ row }) => <div>{row.original.last_name}</div>,
  },
  {
    accessorKey: "first_name",
    header: "First Name",
    cell: ({ row }) => <div>{row.original.first_name}</div>,
  },
  {
    accessorKey: "middle_name",
    header: "Middle Name",
    cell: ({ row }) => <div>{row.original.middle_name || "-"}</div>,
  },
  {
    accessorKey: "extension",
    header: "Ext",
    cell: ({ row }) => <div>{row.original.extension || "-"}</div>,
  },
  {
    accessorKey: "year",
    header: "Year",
    cell: ({ row }) => <div>{row.original.year}</div>,
  },
  {
    accessorKey: "section",
    header: "Section",
    cell: ({ row }) => <div>{row.original.section}</div>,
  },
  {
    accessorKey: "nfc_uid",
    header: "NFC UID",
    cell: ({ row }) => {
      const uid = row.original.nfc_uid
      const registered = row.original.nfc_registered
      if (!uid) {
        return (
          <span className="text-muted-foreground">
            <UserX className="h-4 w-4 inline" /> Not registered
          </span>
        )
      }
      return (
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono">{uid}</code>
          {registered && (
            <UserCheck
              className="h-4 w-4 text-green-500"
              aria-label="Registered"
            />
          )}
        </div>
      )
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <EditStudent student={row.original} />
        <DeleteStudent student={row.original} />
      </div>
    ),
  },
]
