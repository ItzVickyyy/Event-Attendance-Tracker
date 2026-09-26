import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Search, UsersRound } from "lucide-react"
import { useState } from "react"
import { AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 25

function SectionList() {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const programsQuery = useQuery({ queryKey: ["academicPrograms", "section-list"], queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }) })
  const sectionsQuery = useQuery({ queryKey: ["academicSections", page], queryFn: () => AcademicSectionsService.sectionsReadAcademicSections({ query: { skip: page * PAGE_SIZE, limit: PAGE_SIZE } }) })
  const sections = sectionsQuery.data?.data.data ?? []
  const programs = programsQuery.data?.data.data ?? []
  const programMap = new Map(programs.map((program) => [program.id, program]))
  const term = search.trim().toLowerCase()
  const filteredSections = term ? sections.filter((section) => `${section.section_name} ${section.year_level} ${section.academic_year} ${programMap.get(section.program_id)?.program_code ?? ""} ${programMap.get(section.program_id)?.program_name ?? ""}`.toLowerCase().includes(term)) : sections
  const totalPages = Math.max(1, Math.ceil((sectionsQuery.data?.data.count ?? 0) / PAGE_SIZE))

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><p className="text-sm text-muted-foreground">Browse academic sections first, then open a section to see its students.</p><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter visible sections" className="pl-9" /></div></div>
    {sectionsQuery.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading sections…</CardContent></Card> : sectionsQuery.isError ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Unable to load sections.</p><p className="mt-1 text-sm text-muted-foreground">Please try again.</p><Button className="mt-4" variant="outline" onClick={() => sectionsQuery.refetch()}>Retry</Button></CardContent></Card> : filteredSections.length === 0 ? <Card><CardContent className="py-12 text-center"><UsersRound className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No sections found.</p><p className="mt-1 text-sm text-muted-foreground">Try a different filter.</p></CardContent></Card> : <><Table><TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Program</TableHead><TableHead>Year</TableHead><TableHead>Academic Year</TableHead><TableHead className="text-right">Students</TableHead><TableHead /></TableRow></TableHeader><TableBody>{filteredSections.map((section) => <SectionRow key={section.id} section={section} program={programMap.get(section.program_id)} />)}</TableBody></Table><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{sectionsQuery.data?.data.count ?? 0} section{(sectionsQuery.data?.data.count ?? 0) === 1 ? "" : "s"}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}
  </div>
}

function SectionRow({ section, program }: { section: { id: string; section_name: string; year_level: string; academic_year: string }; program?: { program_code: string; program_name: string } }) {
  const studentsQuery = useQuery({ queryKey: ["students", "section-count", section.id], queryFn: () => StudentsService.readStudents({ query: { section_id: section.id, skip: 0, limit: 1 } }) })
  return <TableRow><TableCell className="font-medium">{section.section_name}</TableCell><TableCell>{program ? `${program.program_code} · ${program.program_name}` : "—"}</TableCell><TableCell>{section.year_level}</TableCell><TableCell>{section.academic_year}</TableCell><TableCell className="text-right">{studentsQuery.isLoading ? "…" : studentsQuery.data?.data.count ?? "—"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link to="/sections/$sectionId" params={{ sectionId: section.id }}>View</Link></Button></TableCell></TableRow>
}

export default SectionList
