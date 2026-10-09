import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, Download, Pencil, Plus, QrCode, Search } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAcademicYear } from "@/context/AcademicYearContext"

const api = "/api/v1"
const authHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = localStorage.getItem("access_token")
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

const emptyForm = {
  student_number: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  extension: "",
  email: "",
  contact_number: "",
}

function qrImageUrl(credential: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=16&data=${encodeURIComponent(credential)}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ClassRepresentativeSectionWorkspace() {
  const { activeAcademicYear } = useAcademicYear()
  const client = useQueryClient()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [qrTarget, setQrTarget] = useState<any>(null)

  const assignment = useQuery({
    queryKey: ["class-representative-assignment", activeAcademicYear?.id],
    queryFn: async () => {
      const response = await fetch(
        `${api}/class-representatives/me?academic_year_id=${encodeURIComponent(activeAcademicYear!.id)}`,
        { headers: authHeaders() },
      )
      if (!response.ok) throw new Error("No section assignment found")
      return response.json()
    },
    enabled: Boolean(activeAcademicYear),
  })
  const students = useQuery({
    queryKey: ["class-representative-students", activeAcademicYear?.id],
    queryFn: async () => {
      if (!activeAcademicYear) return { data: [], count: 0 }
      const response = await fetch(
        `${api}/class-representatives/me/students?academic_year_id=${encodeURIComponent(activeAcademicYear.id)}`,
        {
          headers: {
            ...authHeaders(),
            "X-Academic-Year-ID": activeAcademicYear.id,
          },
        },
      )
      if (!response.ok) throw new Error("Unable to load students")
      return response.json()
    },
    enabled: Boolean(activeAcademicYear),
  })

  const openStudentQr = async (student: any) => {
    try {
      const response = await fetch(
        `${api}/academic-registry/students/${student.id}?academic_year_id=${encodeURIComponent(activeAcademicYear!.id)}`,
        { headers: authHeaders() },
      )
      const details = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(
          details?.detail ?? "Unable to load the student's QR code",
        )
      if (details?.qr_registered !== true || !details?.qr_credential_value) {
        toast.error("This student does not have an active QR credential.")
        return
      }
      setQrTarget(details)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load the student's QR code",
      )
    }
  }

  const downloadStudentQr = async () => {
    if (!qrTarget?.qr_credential_value) return
    try {
      const response = await fetch(qrImageUrl(qrTarget.qr_credential_value))
      if (!response.ok) throw new Error("Unable to generate QR code")
      const blob = await response.blob()
      downloadBlob(blob, `${qrTarget.student_number}-QR.png`)
    } catch {
      toast.error("Unable to download the QR code. Please try again.")
    }
  }

  const save = async () => {
    const yearQuery = activeAcademicYear
      ? `?academic_year_id=${encodeURIComponent(activeAcademicYear.id)}`
      : ""
    const url = editing
      ? `${api}/academic-registry/students/${editing.id}${yearQuery}`
      : `${api}/class-representatives/me/students${yearQuery}`
    const response = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...form,
        name_extension: form.extension,
        enrollment_id: editing?.enrollment_id,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.detail ?? "Unable to save student")
    }
    toast.success(editing ? "Student updated" : "Student added")
    setDialogOpen(false)
    setEditing(null)
    setForm(emptyForm)
    await client.invalidateQueries({
      queryKey: ["class-representative-students"],
    })
    await client.invalidateQueries({
      queryKey: ["class-representative-assignment"],
    })
  }

  const archive = async (student: any) => {
    if (
      !window.confirm(
        `Archive ${student.first_name} ${student.last_name} from your section?`,
      )
    )
      return
    const response = await fetch(
      `${api}/students/${student.id}?academic_year_id=${encodeURIComponent(activeAcademicYear!.id)}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.detail ?? "Unable to archive student")
      return
    }
    toast.success("Student archived")
    await client.invalidateQueries({
      queryKey: ["class-representative-students"],
    })
    await client.invalidateQueries({
      queryKey: ["class-representative-assignment"],
    })
  }

  const filtered = (students.data?.data ?? []).filter((student: any) =>
    `${student.student_number} ${student.first_name} ${student.middle_name ?? ""} ${student.last_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const section = assignment.data

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Students</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {section
              ? `${section.program_code} ${section.section_name ?? section.section_code}`
              : "My Section"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Academic Year {section?.academic_year}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setForm(emptyForm)
            setDialogOpen(true)
          }}
        >
          <Plus />
          Add student
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Students</span>
            <span className="text-sm font-normal text-muted-foreground">
              {students.data?.count ?? 0} students
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search students"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {students.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading students…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((student: any, index: number) => (
                  <TableRow key={student.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{student.student_number}</TableCell>
                    <TableCell>
                      {[
                        student.last_name,
                        student.first_name,
                        student.middle_name,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </TableCell>
                    <TableCell>{student.email ?? ""}</TableCell>
                    <TableCell>{student.student_status}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="QR Code"
                        onClick={() => void openStudentQr(student)}
                      >
                        <QrCode />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit student"
                        onClick={() => {
                          setEditing(student)
                          setForm({
                            student_number: student.student_number,
                            first_name: student.first_name,
                            middle_name: student.middle_name ?? "",
                            last_name: student.last_name,
                            extension: student.extension ?? "",
                            email: student.email ?? "",
                            contact_number: student.contact_number ?? "",
                          })
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Archive student"
                        onClick={() => void archive(student)}
                      >
                        <Archive />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Student" : "Add Student"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.keys(form).map((field) => (
              <div className="space-y-2" key={field}>
                <Label htmlFor={field}>
                  {field.replaceAll("_", " ")}
                  {["student_number", "first_name", "last_name"].includes(field)
                    ? " *"
                    : ""}
                </Label>
                <Input
                  id={field}
                  value={form[field as keyof typeof form]}
                  onChange={(e) =>
                    setForm({ ...form, [field]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>
              {editing ? "Save changes" : "Add student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(qrTarget)}
        onOpenChange={(open) => !open && setQrTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Student QR Code</DialogTitle>
            <DialogDescription>
              Show or save this QR code for event attendance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              {qrTarget?.qr_credential_value ? (
                <img
                  src={qrImageUrl(qrTarget.qr_credential_value)}
                  alt="Student QR Code"
                  className="size-72"
                />
              ) : null}
            </div>
            <div className="w-full rounded-md bg-muted/40 px-3 py-2 text-center text-sm">
              <div className="font-medium">
                {qrTarget?.last_name}, {qrTarget?.first_name}
              </div>
              <div className="text-muted-foreground">
                {qrTarget?.student_number}
              </div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {qrTarget?.qr_credential_value}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrTarget(null)}>
              Close
            </Button>
            <Button onClick={() => void downloadStudentQr()}>
              <Download />
              Download QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
