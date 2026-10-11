import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, FileUp, Plus } from "lucide-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const api = "/api/v1"
const headers = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
})

export function ClassRepresentativesAdmin() {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    middle_initial: "",
    last_name: "",
    extension: "",
    academic_year_id: "",
    section_id: "",
  })
  const years = useQuery({
    queryKey: ["academic-years-admin"],
    queryFn: async () =>
      (
        await fetch(`${api}/academic-registry/academic-years`, {
          headers: headers(),
        })
      ).json(),
  })
  const sections = useQuery({
    queryKey: ["sections-admin-reps", form.academic_year_id],
    queryFn: async () =>
      (
        await fetch(
          `${api}/academic-registry/sections?academic_year_id=${encodeURIComponent(form.academic_year_id)}`,
          { headers: headers() },
        )
      ).json(),
    enabled: Boolean(form.academic_year_id),
  })
  const reps = useQuery({
    queryKey: ["class-representatives"],
    queryFn: async () =>
      (
        await fetch(`${api}/class-representatives/`, { headers: headers() })
      ).json(),
  })
  const downloadTemplate = () => {
    const csv = "Email,First Name,Middle Initial,Last Name,Extension,Academic Year,Section\\n"
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "Class_Representative_Import_Template.csv"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const importRepresentatives = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      const body = new FormData()
      body.append("file", importFile)
      const response = await fetch("/api/v1/class-representatives/import", { method: "POST", headers: headers(), body })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.detail ?? "Import failed")
      toast.success(`Imported ${result.created_count} Class Representative account(s)`)
      setImportFile(null)
      await client.invalidateQueries({ queryKey: ["class-representatives"] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }
  const create = async () => {
    const response = await fetch(`${api}/class-representatives/`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(form),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.detail ?? "Unable to create Class Representative")
      return
    }
    toast.success("Class Representative account created")
    setOpen(false)
    setForm({
      email: "",
      first_name: "",
      middle_initial: "",
      last_name: "",
      extension: "",
      academic_year_id: "",
      section_id: "",
    })
    await client.invalidateQueries({ queryKey: ["class-representatives"] })
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Class Representatives
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and review section representative accounts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 size-4" />
            CSV Template
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Create Class Representative
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Import Class Representatives</CardTitle>
          <p className="text-sm text-muted-foreground">Upload a CSV using the template. Every row is validated before accounts are created.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="class-rep-import-file">CSV file</Label>
            <Input id="class-rep-import-file" type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={() => void importRepresentatives()} disabled={!importFile || importing}>
            <FileUp className="mr-2 size-4" />
            {importing ? "Importing…" : "Import representatives"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Section</th>
                  <th className="p-2">Academic Year</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(reps.data?.data ?? []).map((rep: any) => (
                  <tr
                    className="border-b"
                    key={`${rep.id}-${rep.assignment_id ?? "none"}`}
                  >
                    <td className="p-2">{rep.full_name}</td>
                    <td className="p-2">{rep.email}</td>
                    <td className="p-2">
                      {rep.program_code
                        ? `${rep.program_code} ${rep.section_name}`
                        : "Unassigned"}
                    </td>
                    <td className="p-2">{rep.academic_year ?? "—"}</td>
                    <td className="p-2">
                      {rep.is_active ? "Active" : "Inactive"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Class Representative</DialogTitle>
            <DialogDescription>Create a login account and assign it to one section for the selected academic year. The representative must change the temporary password on first login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            {(
              [
                ["first_name", "First Name"],
                ["middle_initial", "Middle Initial"],
                ["last_name", "Last Name"],
                ["extension", "Extension"],
                ["email", "Email"],
              ] as const
            ).map(([field, label]) => (
              <div className="space-y-2" key={field}>
                <Label htmlFor={field}>
                  {label}
                  {["first_name", "last_name", "email"].includes(field)
                    ? " *"
                    : ""}
                </Label>
                <Input
                  id={field}
                  value={form[field]}
                  onChange={(e) =>
                    setForm({ ...form, [field]: e.target.value })
                  }
                />
              </div>
            ))}
            </div>
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Academic Year *</Label>
              <Select
                value={form.academic_year_id}
                onValueChange={(value) =>
                  setForm({ ...form, academic_year_id: value, section_id: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select academic year" />
                </SelectTrigger>
                <SelectContent>
                  {(years.data?.data ?? []).map((year: any) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section *</Label>
              <Select
                value={form.section_id}
                onValueChange={(value) =>
                  setForm({ ...form, section_id: value })
                }
                disabled={!form.academic_year_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {(sections.data?.data ?? []).map((section: any) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.program_code} {section.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              The initial password is {"Change" + "ThisPassword"}. The account
              is required to change it after first login. If email delivery is
              enabled, the credentials are sent automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()}>Create account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
