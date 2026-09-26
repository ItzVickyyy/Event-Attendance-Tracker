import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Download,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  const match = /^(AMG|SMP|WMAD)\s+/.exec(sectionName)
  return match?.[1] ?? ""
}

function SectionList() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
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
  const programMap = new Map(programs.map((program) => [program.id, program]))
  const term = search.trim().toLowerCase()
  const filteredSections = term
    ? sections.filter((section) => `${section.section_name} ${section.year_level} ${section.academic_year} ${programMap.get(section.program_id)?.program_code ?? ""} ${programMap.get(section.program_id)?.program_name ?? ""}`.toLowerCase().includes(term))
    : sections
  const totalPages = Math.max(1, Math.ceil((sectionsQuery.data?.data.count ?? 0) / PAGE_SIZE))

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
    setEditingSection(section)
    setProgramId(section.program_id)
    setYearLevel(section.year_level)
    setMajor(getMajorFromSectionName(section.section_name))
    setSectionCode(section.section_name.replace(/^(AMG|SMP|WMAD)\s+/, ""))
    try {
      const response = await fetch(apiUrl(`/academic-catalog/sections/${section.id}/major`), {
        headers: authHeaders(),
      })
      if (response.ok) {
        const assignment = await response.json()
        if (assignment?.major?.code) setMajor(assignment.major.code)
      }
    } catch {
      // The section name remains the fallback source for the edit form.
    }
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedProgram = programMap.get(programId)
      if (!selectedProgram || !sectionCode.trim()) throw new Error("Program and section are required")
      const isUpperYear = yearLevel === "3rd Year" || yearLevel === "4th Year"
      const needsMajor = selectedProgram.program_code === "BSIT" && isUpperYear
      const sectionName = needsMajor && major ? `${major} ${sectionCode.trim()}` : sectionCode.trim()
      const body = {
        program_id: programId,
        year_level: yearLevel,
        section_name: sectionName,
        academic_year: ACADEMIC_YEAR,
      }
      const section = editingSection
        ? await AcademicSectionsService.sectionsUpdateAcademicSection({ path: { section_id: editingSection.id }, body })
        : await AcademicSectionsService.sectionsCreateAcademicSection({ body })
      if (!section.data) throw new Error("Section could not be saved")

      const majorCode = selectedProgram.program_code === "BSCS" && isUpperYear ? "IS" : needsMajor ? major : ""
      if (majorCode) {
        const majorResponse = await fetch(apiUrl(`/academic-catalog/majors?program_id=${programId}`), {
          headers: authHeaders(),
        })
        const majors = majorResponse.ok ? await majorResponse.json() : { data: [] }
        const selectedMajor = majors.data?.find((item: any) => item.code === majorCode)
        if (selectedMajor) {
          await fetch(apiUrl(`/academic-catalog/sections/${section.data.id}/major`), {
            method: "PUT",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ section_id: section.data.id, major_id: selectedMajor.id }),
          })
        }
      } else if (editingSection) {
        await fetch(apiUrl(`/academic-catalog/sections/${editingSection.id}/major`), {
          method: "DELETE",
          headers: authHeaders(),
        })
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

  const canChooseMajor = useMemo(() => {
    const program = programMap.get(programId)
    return Boolean(program && (yearLevel === "3rd Year" || yearLevel === "4th Year"))
  }, [programId, programMap, yearLevel])

  const downloadCsv = async (section: any) => {
    const response = await StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 10000 } })
    const rows = response.data.data
    const csv = [
      ["#", "Student Number", "Name", "Status"],
      ...rows.map((student, index) => [index + 1, student.student_number, student.person_name ?? "", student.academic_status ?? ""]),
    ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${section.section_name}-${section.academic_year}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const downloadXlsx = async (section: any) => {
    const response = await fetch(apiUrl(`/academic-sections/${section.id}/export/xlsx`), { headers: authHeaders() })
    if (!response.ok) {
      toast.error("Unable to generate the Excel file")
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${section.section_name}-${section.academic_year}.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printSection = async (section: any) => {
    const response = await StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 10000 } })
    const program = programMap.get(section.program_id)
    const rows = response.data.data
    const popup = window.open("", "_blank", "width=1000,height=800")
    if (!popup) return
    popup.document.write(`<!doctype html><html><head><title>${section.section_name}</title><style>body{font-family:Arial,sans-serif;padding:32px}h1{margin-bottom:4px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f4f4f4}@media print{body{padding:0}}</style></head><body><h1>${program?.program_code ?? ""} ${section.section_name}</h1><p>College of Computer Studies · ${section.year_level} · Academic Year ${section.academic_year}</p><table><thead><tr><th>#</th><th>Student Number</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows.map((student: any, index: number) => `<tr><td>${index + 1}</td><td>${student.student_number}</td><td>${student.person_name ?? ""}</td><td>${student.academic_status ?? ""}</td></tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <p className="text-sm text-muted-foreground">Manage sections, open student lists, print rosters, and export section records.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter sections" className="pl-9" /></div>
        <Button onClick={openCreate}><Plus />Add section</Button>
      </div>
    </div>
    {sectionsQuery.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading sections…</CardContent></Card> : sectionsQuery.isError ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Unable to load sections.</p><Button className="mt-4" variant="outline" onClick={() => sectionsQuery.refetch()}>Retry</Button></CardContent></Card> : filteredSections.length === 0 ? <Card><CardContent className="py-12 text-center"><UsersRound className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No sections found.</p><p className="mt-1 text-sm text-muted-foreground">Create a section or try a different filter.</p></CardContent></Card> : <><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Course</TableHead><TableHead>Section</TableHead><TableHead>Year Level</TableHead><TableHead>Enrolled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredSections.map((section, index) => <SectionRow key={section.id} index={page * PAGE_SIZE + index + 1} section={section} program={programMap.get(section.program_id)} onEdit={() => void openEdit(section)} onDelete={() => setDeleteTarget(section)} onPrint={() => void printSection(section)} onCsv={() => void downloadCsv(section)} onXlsx={() => void downloadXlsx(section)} />)}</TableBody></Table><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{sectionsQuery.data?.data.count ?? 0} section{(sectionsQuery.data?.data.count ?? 0) === 1 ? "" : "s"}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editingSection ? "Edit Section" : "Add Section"}</DialogTitle><DialogDescription>Choose the course, year level, and section. Majors apply when students enter third year.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><label className="text-sm font-medium">Course</label><Select value={programId} onValueChange={setProgramId}><SelectTrigger className="w-full"><SelectValue placeholder="Select course" /></SelectTrigger><SelectContent>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.program_code} · {program.program_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><label className="text-sm font-medium">Year Level</label><Select value={yearLevel} onValueChange={setYearLevel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["1st Year", "2nd Year", "3rd Year", "4th Year"].map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div>{canChooseMajor && <div className="space-y-2"><label className="text-sm font-medium">Major</label><Select value={major} onValueChange={setMajor}><SelectTrigger className="w-full"><SelectValue placeholder={programMap.get(programId)?.program_code === "BSCS" ? "Intelligent Systems" : "Select major"} /></SelectTrigger><SelectContent>{(programMap.get(programId)?.program_code === "BSCS" ? MAJORS.filter((item) => item.code === "IS") : MAJORS.filter((item) => item.code !== "IS")).map((item) => <SelectItem key={item.code} value={item.code}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><label className="text-sm font-medium">Section</label><Input value={sectionCode} onChange={(event) => setSectionCode(event.target.value.toUpperCase())} placeholder={yearLevel === "1st Year" ? "1A" : "3A"} /></div><p className="text-xs text-muted-foreground">Academic Year: {ACADEMIC_YEAR}</p></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={!programId || !sectionCode.trim() || (canChooseMajor && !major) || saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save section"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete section?</DialogTitle><DialogDescription>This removes the section record. Students linked to it will have their section relationship cleared by the database.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Delete section"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function SectionRow({ section, program, index, onEdit, onDelete, onPrint, onCsv, onXlsx }: { section: any; program?: { program_code: string; program_name: string }; index: number; onEdit: () => void; onDelete: () => void; onPrint: () => void; onCsv: () => void; onXlsx: () => void }) {
  const studentsQuery = useQuery({ queryKey: ["students", "section-count", section.id], queryFn: () => StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 1 } }) })
  const major = getMajorFromSectionName(section.section_name)
  const displayedSection = major ? section.section_name.replace(`${major} `, "") : section.section_name
  return <TableRow><TableCell>{index}</TableCell><TableCell className="font-medium">{program?.program_code ?? "—"}</TableCell><TableCell>{major ? <div><p className="font-medium">{displayedSection}</p><p className="text-xs text-muted-foreground">{major}</p></div> : displayedSection}</TableCell><TableCell>{section.year_level}</TableCell><TableCell>{studentsQuery.isLoading ? "…" : studentsQuery.data?.data.count ?? "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" asChild title="Students"><Link to="/sections/$sectionId/students" params={{ sectionId: section.id }}><UsersRound /></Link></Button><Button variant="ghost" size="icon" onClick={onEdit} title="Edit"><Pencil /></Button><Button variant="ghost" size="icon" onClick={onPrint} title="Print"><Printer /></Button><Button variant="ghost" size="icon" onClick={onXlsx} title="Download XLSX"><Download /></Button><Button variant="ghost" size="icon" onClick={onCsv} title="Download CSV"><span className="text-[10px] font-bold">CSV</span></Button><Button variant="ghost" size="icon" onClick={onDelete} title="Delete"><Trash2 /></Button></div></TableCell></TableRow>
}

export default SectionList
