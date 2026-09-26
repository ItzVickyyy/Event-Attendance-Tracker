import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useState } from "react"
import { StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function StudentSearch() {
  const [search, setSearch] = useState("")
  const [submitted, setSubmitted] = useState("")
  const query = useQuery({
    queryKey: ["students", "global-search", submitted],
    queryFn: () => StudentsService.readStudents({ query: { search: submitted, skip: 0, limit: 25 } }),
    enabled: submitted.trim().length > 0,
  })
  const students = query.data?.data.data ?? []

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" />Global Student Search</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setSubmitted(search.trim()) }}>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student number or name" aria-label="Search students" />
          <Button type="submit" disabled={!search.trim()}>Search</Button>
        </form>
        {query.isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
        {query.isError && <div className="space-y-2"><p className="text-sm font-medium">Unable to search students.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button></div>}
        {!query.isLoading && !query.isError && submitted && students.length === 0 && <p className="text-sm text-muted-foreground">No students match your search.</p>}
        {students.length > 0 && <Table><TableHeader><TableRow><TableHead>Student Number</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Section</TableHead><TableHead /></TableRow></TableHeader><TableBody>{students.map((student) => <TableRow key={student.id}><TableCell className="font-medium">{student.student_number}</TableCell><TableCell>{student.person_name ?? "Unknown"}</TableCell><TableCell>{student.academic_status ? String(student.academic_status) : "—"}</TableCell><TableCell>{student.section_id ? <Link className="underline underline-offset-4" to="/sections/$sectionId" params={{ sectionId: student.section_id }}>Open section</Link> : "—"}</TableCell><TableCell className="text-right">{student.section_id ? <Button variant="ghost" size="sm" asChild><Link to="/sections/$sectionId/students/$studentId" params={{ sectionId: student.section_id, studentId: student.id }}>View student</Link></Button> : <span className="text-xs text-muted-foreground">No section</span>}</TableCell></TableRow>)}</TableBody></Table>}
        {query.data && query.data.data.count > students.length && <p className="text-xs text-muted-foreground">Showing the first {students.length} of {query.data.data.count} matching students.</p>}
      </CardContent>
    </Card>
  )
}
