import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 25
const ACADEMIC_YEAR = "2026-2027"
const MAJORS = [
  { code: "AMG", name: "Animation and Motion Graphics" },
  { code: "SMP", name: "Service Management Program" },
  { code: "WMAD", name: "Web and Mobile Application Development" },
  { code: "IS", name: "Intelligent Systems" },
]

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`
}

function authHeaders() {
  const token = localStorage.getItem("access_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function getMajorFromSectionName(sectionName: string) {
  return /^(AMG|SMP|WMAD|IS)\s+/.exec(sectionName)?.[1] ?? ""
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

function SectionList() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [studentsTarget, setStudentsTarget] = useState<any>(null)
  const [downloadTarget, setDownloadTarget] = useState<any>(null)
  const [programId, setProgramId] = useState("")
  const [yearLevel, setYearLevel] = useState("1st Year")
  const [sectionCode, setSectionCode] = useState("")
  const [major, setMajor] = useState("")

  const programsQuery = useQuery({
    queryKey: ["academicPrograms", "section-list"],
    queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }),
  })
  const sectionsQuery = useQuery({
    queryKey: ["academicSections", page],
    queryFn: () => AcademicSectionsService.sectionsReadAcademicSections({ query: { skip: page * PAGE_SIZE, limit: PAGE_SIZE } }),
  })
  const sections = sectionsQuery.data?.data.data ?? []
  const programs = programsQuery.data?.data.data ?? []
  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const term = search.trim().toLowerCase()
  const filteredSections = term
    ? sections.filter((section) => `${section.section_name} ${section.year_level} ${section.academic_year} ${programMap.get(section.program_id)?.program_code ?? ""}`.toLowerCase().includes(term))
    : sections
  const totalPages = Math.max(1, Math.ceil((sectionsQuery.data?.data.count ?? 0) / PAGE_SIZE))

  const studentsQuery = useQuery({
    queryKey: ["students", "section", studentsTarget?.id],
    queryFn: () => StudentsService.readStudents({ query: { section_id: studentsTarget.id, skip: 0, limit: 10000 } }),
    enabled: Boolean(studentsTarget),
  })

  const resetForm = () => {
    setEditingSection(null)
    setProgramId(programs[0]?.id ?? "")
    setYearLevel("1st Year")
    setSectionCode("")
    setMajor("")
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = async (section: any) => {
    const detectedMajor = getMajorFromSectionName(section.section_name)
    setEditingSection(section)
    setProgramId(section.program_id)
    setYearLevel(section.year_level)
    setMajor(detectedMajor)
    setSectionCode(detectedMajor ? section.section_name.slice(detectedMajor.length).trim() : section.section_name)
    try {
      const response = await fetch(apiUrl(`/academic-catalog/sections/${section.id}/major`), { headers: authHeaders() })
      if (response.ok) {
        const assignment = await response.json()
        if (assignment?.major?.code) setMajor(assignment.major.code)
      }
    } catch {
      // Keep the section-name-derived major.
    }
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedProgram = programMap.get(programId)
      if (!selectedProgram || !sectionCode.trim()) throw new Error("Program and section are required")
      const isUpperYear = yearLevel === "3rd Year" || yearLevel === "4th Year"
      const isBSIT = selectedProgram.program_code === "BSIT"
      const isBSCS = selectedProgram.program_code === "BSCS"
      const needsMajor = isUpperYear && (isBSIT || isBSCS)
      if (needsMajor && !major) throw new Error("Major is required for third- and fourth-year sections")
      const sectionName = needsMajor ? `${major} ${sectionCode.trim()}` : sectionCode.trim()
      const body = { program_id: programId, year_level: yearLevel, section_name: sectionName, academic_year: ACADEMIC_YEAR }
      const section = editingSection
        ? await AcademicSectionsService.sectionsUpdateAcademicSection({ path: { section_id: editingSection.id }, body })
        : await AcademicSectionsService.sectionsCreateAcademicSection({ body })
      if (!section.data) throw new Error("Section could not be saved")

      if (needsMajor) {
        const majorResponse = await fetch(apiUrl(`/academic-catalog/majors?program_id=${programId}`), { headers: authHeaders() })
        if (!majorResponse.ok) throw new Error("Unable to load academic majors")
        const majorData = await majorResponse.json()
        const selectedMajor = majorData.data?.find((item: any) => item.code === major)
        if (!selectedMajor) throw new Error(`Academic major ${major} is not configured for this program`)
        const assignmentResponse = await fetch(apiUrl(`/academic-catalog/sections/${section.data.id}/major`), {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ section_id: section.data.id, major_id: selectedMajor.id }),
        })
        if (!assignmentResponse.ok) throw new Error("Unable to save section major")
      } else if (editingSection) {
        const response = await fetch(apiUrl(`/academic-catalog/sections/${editingSection.id}/major`), { method: "DELETE", headers: authHeaders() })
        if (!response.ok && response.status !== 404) throw new Error("Unable to clear section major")
      }
    },
    onSuccess: () => {
      toast.success(editingSection ? "Section updated" : "Section created")
      setDialogOpen(false)
      resetForm()
      void queryClient.invalidateQueries({ queryKey: ["academicSections"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save section"),
  })

  const deleteMutation = useMutation({
    mutationFn: (sectionId: string) => AcademicSectionsService.sectionsDeleteAcademicSection({ path: { section_id: sectionId } }),
    onSuccess: () => {
      toast.success("Section deleted")
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["academicSections"] })
    },
    onError: () => toast.error("Unable to delete section"),
  })

  const downloadCsv = async (section: any) => {
    try {
      const response = await StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 10000 } })
      const rows = response.data.data
      const csv = [
        ["#", "Student Number", "Name", "Academic Status"],
        ...rows.map((student: any, index: number) => [index + 1, student.student_number, student.person_name ?? "", student.academic_status ?? ""]),
      ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n")
      downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${section.section_name}-${section.academic_year}.csv`)
    } catch {
      toast.error("Unable to generate the CSV file")
    }
  }

  const downloadFile = async (section: any, format: "docx" | "xlsx") => {
    try {
      const response = await fetch(apiUrl(`/academic-sections/${section.id}/export/${format}`), { headers: authHeaders() })
      if (!response.ok) throw new Error()
      const disposition = response.headers.get("content-disposition")
      const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? `${section.section_name}-${section.academic_year}.${format}`
      downloadBlob(await response.blob(), filename)
      setDownloadTarget(null)
    } catch {
      toast.error(`Unable to generate the ${format.toUpperCase()} file`)
    }
  }

  const printSection = async (section: any) => {
    try {
      const response = await StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 10000 } })
      const program = programMap.get(section.program_id)
      const rows = response.data.data
      const popup = window.open("", "_blank", "width=1000,height=800")
      if (!popup) {
        toast.error("The print window was blocked. Allow pop-ups for this site and try again.")
        return
      }
      const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
      popup.document.write(`<!doctype html><html><head><title>${esc(program?.program_code)} ${esc(section.section_name)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f4f4f4}@media print{body{padding:0}}</style></head><body><h1>${esc(program?.program_code)} ${esc(section.section_name)}</h1><p>College of Computer Studies · ${esc(section.year_level)} · Academic Year ${esc(section.academic_year)}</p><table><thead><tr><th>#</th><th>Student Number</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows.map((student: any, index: number) => `<tr><td>${index + 1}</td><td>${esc(student.student_number)}</td><td>${esc(student.person_name)}</td><td>${esc(student.academic_status)}</td></tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
      popup.document.close()
    } catch {
      toast.error("Unable to prepare the print roster")
    }
  }

  const canChooseMajor = useMemo(() => {
    const program = programMap.get(programId)
    return Boolean(program && (yearLevel === "3rd Year" || yearLevel === "4th Year") && (program.program_code === "BSIT" || program.program_code === "BSCS"))
  }, [programId, programMap, yearLevel])

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <p className="text-sm text-muted-foreground">Manage sections, open student lists, print rosters, and export section records.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Filter sections" className="pl-9" /></div>
        <Button onClick={openCreate}><Plus />Add section</Button>
      </div>
    </div>
    {sectionsQuery.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading sections…</CardContent></Card> : sectionsQuery.isError ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Unable to load sections.</p><Button className="mt-4" variant="outline" onClick={() => sectionsQuery.refetch()}>Retry</Button></CardContent></Card> : filteredSections.length === 0 ? <Card><CardContent className="py-12 text-center"><UsersRound className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No sections found.</p><p className="mt-1 text-sm text-muted-foreground">Create a section or try a different filter.</p></CardContent></Card> : <><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Course</TableHead><TableHead>Section</TableHead><TableHead>Year Level</TableHead><TableHead>Enrolled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredSections.map((section, index) => <SectionRow key={section.id} index={page * PAGE_SIZE + index + 1} section={section} program={programMap.get(section.program_id)} onStudents={() => setStudentsTarget(section)} onEdit={() => void openEdit(section)} onDelete={() => setDeleteTarget(section)} onPrint={() => void printSection(section)} onDownload={() => setDownloadTarget(section)} onCsv={() => void downloadCsv(section)} />)}</TableBody></Table><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{sectionsQuery.data?.data.count ?? 0} section{(sectionsQuery.data?.data.count ?? 0) === 1 ? "" : "s"}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle><DialogDescription>Choose the course, year level, major when applicable, and section.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><label className="text-sm font-medium">Course</label><Select value={programId} onValueChange={setProgramId}><SelectTrigger className="w-full"><SelectValue placeholder="Select course" /></SelectTrigger><SelectContent>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.program_code} · {program.program_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><label className="text-sm font-medium">Year Level</label><Select value={yearLevel} onValueChange={setYearLevel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["1st Year", "2nd Year", "3rd Year", "4th Year"].map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div>{canChooseMajor && <div className="space-y-2"><label className="text-sm font-medium">Major</label><Select value={major} onValueChange={setMajor}><SelectTrigger className="w-full"><SelectValue placeholder="Select major" /></SelectTrigger><SelectContent>{(programMap.get(programId)?.program_code === "BSCS" ? MAJORS.filter((item) => item.code === "IS") : MAJORS.filter((item) => item.code !== "IS")).map((item) => <SelectItem key={item.code} value={item.code}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><label className="text-sm font-medium">Section</label><Input value={sectionCode} onChange={(event) => setSectionCode(event.target.value.toUpperCase())} placeholder={yearLevel === "1st Year" ? "1A" : "3A"} /></div><p className="text-xs text-muted-foreground">Academic Year: {ACADEMIC_YEAR}</p></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={!programId || !sectionCode.trim() || (canChooseMajor && !major) || saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save section"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(studentsTarget)} onOpenChange={(open) => !open && setStudentsTarget(null)}><DialogContent className="max-w-6xl"><DialogHeader><DialogTitle>{studentsTarget ? `${programMap.get(studentsTarget.program_id)?.program_code ?? ""} ${studentsTarget.section_name}` : "Students"}</DialogTitle><DialogDescription>{studentsTarget?.year_level} · Academic Year {studentsTarget?.academic_year}</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-auto">{studentsQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading students…</p> : studentsQuery.isError ? <p className="py-8 text-center text-sm text-destructive">Unable to load students.</p> : studentsQuery.data?.data.data.length ? <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Student Number</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{studentsQuery.data.data.data.map((student: any, index: number) => <TableRow key={student.id}><TableCell>{index + 1}</TableCell><TableCell>{student.student_number}</TableCell><TableCell>{student.person_name}</TableCell><TableCell>{student.academic_status ?? "—"}</TableCell></TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">No students are enrolled in this section yet.</p>}</div><DialogFooter><Button variant="outline" onClick={() => setStudentsTarget(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(downloadTarget)} onOpenChange={(open) => !open && setDownloadTarget(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Download section roster</DialogTitle><DialogDescription>Choose the file format for {downloadTarget?.section_name}.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-24 flex-col gap-2" onClick={() => downloadTarget && void downloadFile(downloadTarget, "docx")}><FileText className="size-6" /><span>DOCX</span></Button><Button variant="outline" className="h-24 flex-col gap-2" onClick={() => downloadTarget && void downloadFile(downloadTarget, "xlsx")}><FileSpreadsheet className="size-6" /><span>XLSX</span></Button></div><DialogFooter><Button variant="ghost" onClick={() => setDownloadTarget(null)}>Cancel</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete section?</DialogTitle><DialogDescription>This removes the section record. Students linked to it will have their section relationship cleared by the database.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Delete section"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function SectionRow({ section, program, index, onStudents, onEdit, onDelete, onPrint, onDownload, onCsv }: { section: any; program?: { program_code: string; program_name: string }; index: number; onStudents: () => void; onEdit: () => void; onDelete: () => void; onPrint: () => void; onDownload: () => void; onCsv: () => void }) {
  const studentsQuery = useQuery({ queryKey: ["students", "section-count", section.id], queryFn: () => StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 1 } }) })
  return <TableRow><TableCell>{index}</TableCell><TableCell className="font-medium">{program?.program_code ?? "—"}</TableCell><TableCell className="font-medium">{section.section_name}</TableCell><TableCell>{section.year_level}</TableCell><TableCell>{studentsQuery.isLoading ? "…" : studentsQuery.data?.data.count ?? "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={onStudents} title="Students"><UsersRound /></Button><Button variant="ghost" size="icon" onClick={onEdit} title="Edit"><Pencil /></Button><Button variant="ghost" size="icon" onClick={onPrint} title="Print"><Printer /></Button><Button variant="ghost" size="icon" onClick={onDownload} title="Download DOCX or XLSX"><Download /></Button><Button variant="ghost" size="icon" onClick={onCsv} title="Download CSV"><span className="text-[10px] font-bold">CSV</span></Button><Button variant="ghost" size="icon" onClick={onDelete} title="Delete"><Trash2 /></Button></div></TableCell></TableRow>
}

export default SectionList
