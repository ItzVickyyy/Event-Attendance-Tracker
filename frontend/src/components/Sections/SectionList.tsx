import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, FileSpreadsheet, FileText, FileUp, Pencil, Plus, Printer, Trash2, UsersRound } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AcademicProgramsService } from "@/client"
import { useAcademicYear } from "@/context/AcademicYearContext"
import { Button } from "@/components/ui/button"
import { StudentImportDialog } from "@/components/Sections/StudentImportDialog"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"


function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`
}

function authHeaders(extra: Record<string, string> = {}) {
  const token = localStorage.getItem("access_token")
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { ...init, headers: authHeaders({ ...(init?.headers as Record<string, string> | undefined) }) })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? "Request failed")
  }
  return response.json()
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

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function SectionList() {
  const queryClient = useQueryClient()
  const [sectionDialog, setSectionDialog] = useState(false)
  const [editingSection, setEditingSection] = useState<any>(null)
  const [studentsTarget, setStudentsTarget] = useState<any>(null)
  const [downloadTarget, setDownloadTarget] = useState<any>(null)
  const [printTarget, setPrintTarget] = useState<any>(null)
  const [studentTarget, setStudentTarget] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [importDialog, setImportDialog] = useState(false)
  const [programId, setProgramId] = useState("")
  const [academicYearId, setAcademicYearId] = useState("")
  const [yearLevel, setYearLevel] = useState("1st Year")
  const [sectionCode, setSectionCode] = useState("")
  const [majorId, setMajorId] = useState("")
  const [studentForm, setStudentForm] = useState<Record<string, string>>({})
  const [studentSearch, setStudentSearch] = useState("")
  const [studentPage, setStudentPage] = useState(1)
  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const [newStudentForm, setNewStudentForm] = useState<Record<string, string>>({ student_number: "", first_name: "", middle_name: "", last_name: "", name_extension: "", email: "", contact_number: "", student_status: "regular" })
  const { activeAcademicYear } = useAcademicYear()

  const programsQuery = useQuery({
    queryKey: ["academicPrograms", "section-registry"],
    queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }),
  })
  const yearsQuery = useQuery({
    queryKey: ["academicYears", "section-registry"],
    queryFn: () => apiJson<any>("/academic-registry/academic-years"),
  })
  const sectionsQuery = useQuery({
    queryKey: ["academicRegistrySections", activeAcademicYear?.id],
    queryFn: () => apiJson<any>(`/academic-registry/sections${activeAcademicYear?.id ? `?academic_year_id=${encodeURIComponent(activeAcademicYear.id)}` : ""}`),
    enabled: Boolean(activeAcademicYear),
  })
  const majorsQuery = useQuery({
    queryKey: ["academicMajors", programId],
    queryFn: () => apiJson<any>(`/academic-catalog/majors?program_id=${programId}`),
    enabled: Boolean(programId),
  })
  const rosterQuery = useQuery({
    queryKey: ["academicRegistryRoster", studentsTarget?.id],
    queryFn: () => apiJson<any>(`/academic-registry/sections/${studentsTarget.id}/students`),
    enabled: Boolean(studentsTarget),
  })
  const rosterStudents = rosterQuery.data?.data ?? []
  const filteredRosterStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase()
    if (!query) return rosterStudents
    return rosterStudents.filter((student: any) => [student.student_number, student.last_name, student.first_name, student.middle_name, student.email, student.contact_number].some((value) => String(value ?? "").toLowerCase().includes(query)))
  }, [rosterStudents, studentSearch])
  const studentPageSize = 10
  const studentPageCount = Math.max(1, Math.ceil(filteredRosterStudents.length / studentPageSize))
  const visibleRosterStudents = filteredRosterStudents.slice((studentPage - 1) * studentPageSize, studentPage * studentPageSize)
  const printRosterQuery = useQuery({
    queryKey: ["academicRegistryPrintRoster", printTarget?.id],
    queryFn: () => apiJson<any>(`/academic-registry/sections/${printTarget.id}/students`),
    enabled: Boolean(printTarget),
  })
  const programs = programsQuery.data?.data.data ?? []
  const years = yearsQuery.data?.data ?? []
  const sections = sectionsQuery.data?.data ?? []
  const filteredSections = sections

  const selectedProgram = programs.find((program: any) => program.id === programId)
  const majorOptions = majorsQuery.data?.data ?? []
  const currentYear = years.find((year: any) => year.is_current) ?? years[0]

  const resetSectionForm = () => {
    setEditingSection(null)
    setProgramId(programs[0]?.id ?? "")
    setAcademicYearId(currentYear?.id ?? "")
    setYearLevel("1st Year")
    setSectionCode("")
    setMajorId("")
  }

  const openCreate = () => {
    resetSectionForm()
    setSectionDialog(true)
  }

  const openEdit = (section: any) => {
    setEditingSection(section)
    setProgramId(section.program_id)
    setAcademicYearId(section.academic_year_id)
    setYearLevel(section.year_level)
    setSectionCode(section.section_code)
    setMajorId(majorOptions.find((major: any) => major.code === section.major_code)?.id ?? "")
    setSectionDialog(true)
  }

  const saveSection = useMutation({
    mutationFn: async () => {
      const upperYear = yearLevel === "3rd Year" || yearLevel === "4th Year"
      const payload = { program_id: programId, academic_year_id: academicYearId, year_level: yearLevel, section_code: sectionCode.trim().toUpperCase(), major_id: upperYear ? majorId || null : null }
      if (!payload.program_id || !payload.academic_year_id || !payload.section_code) throw new Error("Course, academic year, and section are required")
      if (upperYear && !payload.major_id) throw new Error("Major is required for third- and fourth-year sections")
      return apiJson(editingSection ? `/academic-registry/sections/${editingSection.id}` : "/academic-registry/sections", { method: editingSection ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    },
    onSuccess: () => {
      toast.success(editingSection ? "Section updated" : "Section created")
      setSectionDialog(false)
      void queryClient.invalidateQueries({ queryKey: ["academicRegistrySections"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save section"),
  })

  const openStudent = async (student: any) => {
    setStudentTarget(student)
    const details = await apiJson<any>(`/academic-registry/students/${student.id}`)
    setStudentForm(Object.fromEntries(Object.entries(details).map(([key, value]) => [key, value == null ? "" : String(value)])))
  }

  const createStudent = useMutation({
    mutationFn: () => {
      if (!studentsTarget) throw new Error("Section is required")
      return apiJson("/academic-registry/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newStudentForm, section_id: studentsTarget.id, academic_year_id: studentsTarget.academic_year_id }),
      })
    },
    onSuccess: () => {
      toast.success("Student added")
      setAddStudentOpen(false)
      setNewStudentForm({ student_number: "", first_name: "", middle_name: "", last_name: "", name_extension: "", email: "", contact_number: "", student_status: "regular" })
      setStudentPage(1)
      void queryClient.invalidateQueries({ queryKey: ["academicRegistryRoster"] })
      void queryClient.invalidateQueries({ queryKey: ["academicRegistrySections"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to add student"),
  })

  const saveStudent = useMutation({
    mutationFn: () => apiJson(`/academic-registry/students/${studentTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studentForm) }),
    onSuccess: () => {
      toast.success("Student updated")
      setStudentTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["academicRegistryRoster"] })
      void queryClient.invalidateQueries({ queryKey: ["academicRegistrySections"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update student"),
  })

  const archiveStudent = useMutation({
    mutationFn: () => apiJson(`/students/${deleteTarget.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Student archived")
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["academicRegistryRoster"] })
      void queryClient.invalidateQueries({ queryKey: ["academicRegistrySections"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to archive student"),
  })

  const exportFile = async (section: any, format: "xlsx" | "docx") => {
    try {
      const response = await fetch(apiUrl(`/academic-sections/${section.id}/export/${format}`), { headers: authHeaders() })
      if (!response.ok) throw new Error()
      const disposition = response.headers.get("content-disposition")
      const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? `${section.program_code}-${section.section_code}-${section.academic_year}.${format}`
      downloadBlob(await response.blob(), filename)
      setDownloadTarget(null)
    } catch {
      toast.error(`Unable to generate the ${format.toUpperCase()} file`)
    }
  }

  const exportCsv = async (section: any) => {
    try {
      const roster = await apiJson<any>(`/academic-registry/sections/${section.id}/students`)
      const rows: Array<Array<string | number>> = roster.data.map((student: any, index: number) => [index + 1, student.student_number, student.last_name, student.first_name, student.middle_name ?? "", student.extension ?? "", student.email ?? "", student.contact_number ?? "", student.student_status])
      const csv = [["#", "Student Number", "Last Name", "First Name", "Middle Name", "Extension", "Email", "Contact Number", "Status"], ...rows].map((row) => row.map((value: string | number) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n")
      downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${section.program_code}-${section.section_code}-${section.academic_year}.csv`)
      setDownloadTarget(null)
    } catch {
      toast.error("Unable to generate the CSV file")
    }
  }

  const printPreview = printRosterQuery.data?.data ?? []

  const printRoster = () => {
    if (!printTarget) return
    const rows = printPreview.map((student: any, index: number) => `<tr><td>${index + 1}</td><td>${escapeHtml(student.student_number)}</td><td>${escapeHtml(student.last_name)}</td><td>${escapeHtml(student.first_name)}</td><td>${escapeHtml(student.middle_name)}</td></tr>`).join("")
    const popup = window.open("", "_blank", "width=1000,height=800")
    if (!popup) {
      toast.error("Allow pop-ups to print the roster")
      return
    }
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(printTarget.program_code)} ${escapeHtml(printTarget.section_code)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}header{text-align:center;margin-bottom:24px}h1{margin:0 0 6px;font-size:20px}p{margin:3px 0;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:7px;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><header><h1>Laguna State Polytechnic University</h1><p>College of Computer Studies</p><p>${escapeHtml(printTarget.program_code)}${printTarget.major_code ? ` · ${escapeHtml(printTarget.major_code)}` : ""} ${escapeHtml(printTarget.section_code)}</p><p>${escapeHtml(printTarget.year_level)} · Academic Year ${escapeHtml(printTarget.academic_year)}</p></header><table><thead><tr><th>#</th><th>Student Number</th><th>Last Name</th><th>First Name</th><th>Middle Name</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  const canChooseMajor = Boolean(selectedProgram && (yearLevel === "3rd Year" || yearLevel === "4th Year"))

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <p className="text-sm text-muted-foreground">Manage academic sections and their year-scoped student enrollments.</p>
      <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={() => setImportDialog(true)}><FileUp />Import students</Button><Button onClick={openCreate}><Plus />Add section</Button></div>
    </div>
    {sectionsQuery.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading sections…</CardContent></Card> : sectionsQuery.isError ? <Card><CardContent className="py-12 text-center">Unable to load sections.</CardContent></Card> : <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Course</TableHead><TableHead>Major</TableHead><TableHead>Section</TableHead><TableHead>Year Level</TableHead><TableHead>Enrolled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredSections.map((section: any, index: number) => <TableRow key={section.id}><TableCell>{index + 1}</TableCell><TableCell className="font-medium">{section.program_code}</TableCell><TableCell>{section.major_code ?? ""}</TableCell><TableCell className="font-medium">{section.section_code}</TableCell><TableCell>{section.year_level}</TableCell><TableCell>{section.enrolled}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Students" onClick={() => setStudentsTarget(section)}><UsersRound /></Button><Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(section)}><Pencil /></Button><Button variant="ghost" size="icon" title="Print preview" onClick={() => setPrintTarget(section)}><Printer /></Button><Button variant="ghost" size="icon" title="Download" onClick={() => setDownloadTarget(section)}><Download /></Button></div></TableCell></TableRow>)}</TableBody></Table>}

    <StudentImportDialog open={importDialog} onOpenChange={setImportDialog} academicYear={activeAcademicYear} sections={sections} onImported={() => { void queryClient.invalidateQueries({ queryKey: ["academicRegistrySections"] }); void queryClient.invalidateQueries({ queryKey: ["academicRegistryRoster"] }) }} />

    <Dialog open={sectionDialog} onOpenChange={setSectionDialog}><DialogContent><DialogHeader><DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle><DialogDescription>Course, major, section code, year level, and academic year are stored separately.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><span className="text-sm font-medium">Course</span><Select value={programId} onValueChange={(value) => { setProgramId(value); setMajorId("") }}><SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger><SelectContent>{programs.map((program: any) => <SelectItem key={program.id} value={program.id}>{program.program_code} · {program.program_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><span className="text-sm font-medium">Academic Year</span><Select value={academicYearId} onValueChange={setAcademicYearId}><SelectTrigger><SelectValue placeholder="Select academic year" /></SelectTrigger><SelectContent>{years.map((year: any) => <SelectItem key={year.id} value={year.id}>{year.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><span className="text-sm font-medium">Year Level</span><Select value={yearLevel} onValueChange={(value) => { setYearLevel(value); if (value === "1st Year" || value === "2nd Year") setMajorId("") }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["1st Year", "2nd Year", "3rd Year", "4th Year"].map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div>{canChooseMajor && <div className="space-y-2"><span className="text-sm font-medium">Major</span><Select value={majorId} onValueChange={setMajorId}><SelectTrigger><SelectValue placeholder="Select major" /></SelectTrigger><SelectContent>{majorOptions.map((major: any) => <SelectItem key={major.id} value={major.id}>{major.code} · {major.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><span className="text-sm font-medium">Section</span><Input value={sectionCode} onChange={(event) => setSectionCode(event.target.value.toUpperCase())} placeholder="3A" /></div></div><DialogFooter><Button variant="outline" onClick={() => setSectionDialog(false)}>Cancel</Button><Button onClick={() => saveSection.mutate()} disabled={saveSection.isPending}>{saveSection.isPending ? "Saving…" : "Save section"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(studentsTarget)} onOpenChange={(open) => { if (!open) { setStudentsTarget(null); setStudentSearch(""); setStudentPage(1) } }}>
      <DialogContent className="w-[96vw] max-w-[1400px] max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-2xl">{studentsTarget ? studentsTarget.program_code + (studentsTarget.major_code ? " · " + studentsTarget.major_code : "") + " " + studentsTarget.section_code : "Students"}</DialogTitle>
              <DialogDescription className="flex flex-wrap gap-x-3 gap-y-1">
                <span>{studentsTarget?.program_code}</span><span>·</span><span>{studentsTarget?.year_level}</span><span>·</span><span>Academic Year {studentsTarget?.academic_year}</span>
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2">
              <UsersRound className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{rosterQuery.isLoading ? "Loading…" : rosterStudents.length + " " + (rosterStudents.length === 1 ? "student" : "students")}</span>
            </div>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Input value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentPage(1) }} placeholder="Search students by number or name…" className="w-full sm:max-w-md" />
            <Button onClick={() => setAddStudentOpen(true)}><Plus />Add Student</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-6">
            {rosterQuery.isLoading ? <div className="space-y-3 py-4">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="grid grid-cols-7 gap-3 rounded-md border p-4">{Array.from({ length: 7 }).map((__, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-muted" />)}</div>)}</div>
            : rosterStudents.length === 0 ? <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><UsersRound className="mb-4 size-10 text-muted-foreground/50" /><h3 className="font-semibold">No students yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">This section has no active students for the selected academic year.</p></div>
            : filteredRosterStudents.length === 0 ? <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><p className="font-semibold">No students found</p><p className="mt-1 text-sm text-muted-foreground">Try a different student number or name.</p></div>
            : <Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead className="w-12">#</TableHead><TableHead className="min-w-[160px]">Student Number</TableHead><TableHead className="min-w-[280px]">Full Name</TableHead><TableHead className="min-w-[220px]">Email</TableHead><TableHead className="min-w-[150px]">Contact</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px] text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{visibleRosterStudents.map((student: any, index: number) => <TableRow key={student.id}><TableCell className="text-muted-foreground">{(studentPage - 1) * studentPageSize + index + 1}</TableCell><TableCell className="font-semibold tabular-nums">{student.student_number}</TableCell><TableCell><div className="font-medium">{student.last_name}, {student.first_name}{student.middle_name ? " " + student.middle_name : ""}</div>{student.extension ? <div className="text-xs text-muted-foreground">{student.extension}</div> : null}</TableCell><TableCell className="text-sm">{student.email ?? "—"}</TableCell><TableCell className="text-sm">{student.contact_number ?? "—"}</TableCell><TableCell><span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize">{String(student.student_status).replaceAll("_", " ")}</span></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Edit student" onClick={() => void openStudent(student)}><Pencil /></Button><Button variant="ghost" size="icon" title="Archive student" onClick={() => setDeleteTarget(student)}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table>}
          </div>
          {!rosterQuery.isLoading && filteredRosterStudents.length > 0 ? <div className="flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Showing {(studentPage - 1) * studentPageSize + 1}–{Math.min(studentPage * studentPageSize, filteredRosterStudents.length)} of {filteredRosterStudents.length}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={studentPage <= 1} onClick={() => setStudentPage((page) => Math.max(1, page - 1))}>Previous</Button><span className="text-sm text-muted-foreground">Page {studentPage} of {studentPageCount}</span><Button variant="outline" size="sm" disabled={studentPage >= studentPageCount} onClick={() => setStudentPage((page) => Math.min(studentPageCount, page + 1))}>Next</Button></div></div> : null}
        </div>
        <DialogFooter className="border-t px-6 py-4"><Button variant="outline" onClick={() => setStudentsTarget(null)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add Student</DialogTitle><DialogDescription>Add a student to \${studentsTarget?.program_code} \${studentsTarget?.section_code} for Academic Year \${studentsTarget?.academic_year}.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><span className="text-sm font-medium">Student Number</span><Input value={newStudentForm.student_number ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, student_number: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Last Name</span><Input value={newStudentForm.last_name ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, last_name: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">First Name</span><Input value={newStudentForm.first_name ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, first_name: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Middle Name</span><Input value={newStudentForm.middle_name ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, middle_name: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Extension</span><Input value={newStudentForm.name_extension ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, name_extension: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Email</span><Input value={newStudentForm.email ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, email: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Contact Number</span><Input value={newStudentForm.contact_number ?? ""} onChange={(event) => setNewStudentForm((current) => ({ ...current, contact_number: event.target.value }))} /></div>
          <div className="space-y-2"><span className="text-sm font-medium">Academic Status</span><Select value={newStudentForm.student_status} onValueChange={(value) => setNewStudentForm((current) => ({ ...current, student_status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regular">Regular</SelectItem><SelectItem value="irregular">Irregular</SelectItem></SelectContent></Select></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAddStudentOpen(false)}>Cancel</Button><Button onClick={() => createStudent.mutate()} disabled={createStudent.isPending || !newStudentForm.student_number.trim() || !newStudentForm.first_name.trim() || !newStudentForm.last_name.trim()}>{createStudent.isPending ? "Adding…" : "Add Student"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(studentTarget)} onOpenChange={(open) => !open && setStudentTarget(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit Student</DialogTitle><DialogDescription>Identity details are separate from the student's academic enrollment.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{[["student_number", "Student Number"], ["last_name", "Last Name"], ["first_name", "First Name"], ["middle_name", "Middle Name"], ["name_extension", "Extension"], ["email", "Email"], ["contact_number", "Contact Number"]].map(([key, label]) => <div className="space-y-2" key={key}><span className="text-sm font-medium">{label}</span><Input value={studentForm[key] ?? ""} onChange={(event) => setStudentForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}<div className="space-y-2"><span className="text-sm font-medium">Student Status</span><Select value={studentForm.student_status ?? "regular"} onValueChange={(value) => setStudentForm((current) => ({ ...current, student_status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regular">Regular</SelectItem><SelectItem value="irregular">Irregular</SelectItem></SelectContent></Select></div></div><div className="rounded-md border p-3 text-sm text-muted-foreground">NFC: {studentForm.nfc_registered === "true" ? "Registered" : "Not registered"} · QR: {studentForm.qr_registered === "true" ? "Registered" : "Not registered"}</div><DialogFooter><Button variant="outline" onClick={() => setStudentTarget(null)}>Cancel</Button><Button onClick={() => saveStudent.mutate()} disabled={saveStudent.isPending}>{saveStudent.isPending ? "Saving…" : "Save student"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Archive student?</DialogTitle><DialogDescription>The student identity remains in the database. The current enrollment will no longer appear in active rosters.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => archiveStudent.mutate()} disabled={archiveStudent.isPending}>{archiveStudent.isPending ? "Archiving…" : "Archive student"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(downloadTarget)} onOpenChange={(open) => !open && setDownloadTarget(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Download roster</DialogTitle><DialogDescription>Choose a format for {downloadTarget?.program_code} {downloadTarget?.section_code}.</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-3"><Button variant="outline" className="h-24 flex-col gap-2" onClick={() => void exportFile(downloadTarget, "xlsx")}><FileSpreadsheet className="size-6" /><span>XLSX</span></Button><Button variant="outline" className="h-24 flex-col gap-2" onClick={() => void exportFile(downloadTarget, "docx")}><FileText className="size-6" /><span>DOCX</span></Button><Button variant="outline" className="h-24 flex-col gap-2" onClick={() => void exportCsv(downloadTarget)}><span className="text-lg font-bold">CSV</span><span>CSV</span></Button></div></DialogContent></Dialog>

    <Dialog open={Boolean(printTarget)} onOpenChange={(open) => !open && setPrintTarget(null)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Print Preview</DialogTitle><DialogDescription>Formatted roster preview for {printTarget?.program_code} {printTarget?.major_code ? `· ${printTarget.major_code}` : ""} {printTarget?.section_code}.</DialogDescription></DialogHeader><div className="max-h-[65vh] overflow-auto rounded-md border bg-white p-8 text-black"><div className="mb-6 text-center"><h2 className="text-lg font-bold">Laguna State Polytechnic University</h2><p>College of Computer Studies</p><p className="font-semibold">{printTarget?.program_code}{printTarget?.major_code ? ` · ${printTarget.major_code}` : ""} {printTarget?.section_code}</p><p>{printTarget?.year_level} · Academic Year {printTarget?.academic_year}</p></div>{printRosterQuery.isLoading ? <p className="py-8 text-center">Loading preview…</p> : <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Student Number</TableHead><TableHead>Last Name</TableHead><TableHead>First Name</TableHead><TableHead>Middle Name</TableHead></TableRow></TableHeader><TableBody>{printPreview.map((student: any, index: number) => <TableRow key={student.id}><TableCell>{index + 1}</TableCell><TableCell>{student.student_number}</TableCell><TableCell>{student.last_name}</TableCell><TableCell>{student.first_name}</TableCell><TableCell>{student.middle_name ?? ""}</TableCell></TableRow>)}</TableBody></Table>}</div><DialogFooter><Button variant="outline" onClick={() => setPrintTarget(null)}>Close</Button><Button onClick={printRoster} disabled={printRosterQuery.isLoading || !printPreview.length}><Printer />Print</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

export default SectionList
