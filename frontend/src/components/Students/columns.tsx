import type { ColumnDef } from "@tanstack/react-table"

import type { PersonPublic, StudentPublic } from "@/client"
import DeleteStudent from "./DeleteStudent"
import EditStudent from "./EditStudent"

export type StudentTableRow = StudentPublic & { person: PersonPublic | null }

function formatName(person: PersonPublic | null): string {
  if (!person) return "Unknown"
  return (
    [
      person.first_name,
      person.middle_name,
      person.last_name,
      person.name_extension,
    ]
      .filter(Boolean)
      .join(" ") || "Unknown"
  )
}

export const studentsColumns: ColumnDef<StudentTableRow>[] = [
  {
    accessorKey: "student_number",
    header: "Student Number",
    cell: ({ row }) => (
      <div className="font-mono text-sm">{row.original.student_number}</div>
    ),
  },
  {
    id: "name",
    header: "Student Name",
    accessorFn: (row) => formatName(row.person),
    cell: ({ row }) => <div>{formatName(row.original.person)}</div>,
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
