import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const api = "/api/v1"
const headers = () => ({ Authorization: "Bearer " + localStorage.getItem("access_token"), "Content-Type": "application/json" })

export function ClassRepresentativesAdmin() {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: "", first_name: "", middle_initial: "", last_name: "", extension: "", academic_year_id: "", section_id: "" })
  const years = useQuery({ queryKey: ["academic-years-admin"], queryFn: async () => (await fetch(api + "/academic-registry/academic-years", { headers: headers() })).json() })
  const sections = useQuery({ queryKey: ["sections-admin-reps", form.academic_year_id], queryFn: async () => (await fetch(api + "/academic-registry/sections?academic_year_id=" + encodeURIComponent(form.academic_year_id), { headers: headers() })).json(), enabled: Boolean(form.academic_year_id) })
  const reps = useQuery({ queryKey: ["class-representatives"], queryFn: async () => (await fetch(api + "/class-representatives", { headers: headers() })).json() })
  const create = async () => {
    const response = await fetch(api + "/class-representatives", { method: "POST", headers: headers(), body: JSON.stringify(form) })
    if (!response.ok) { const body = await response.json().catch(() => null); toast.error(body?.detail ?? "Unable to create Class Representative"); return }
    toast.success("Class Representative account created")
    setOpen(false); setForm({ email: "", first_name: "", middle_initial: "", last_name: "", extension: "", academic_year_id: "", section_id: "" })
    await client.invalidateQueries({ queryKey: ["class-representatives"] })
  }
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Class Representatives</h1><p className="mt-1 text-sm text-muted-foreground">Create and review section representative accounts.</p></div><Button onClick={() => setOpen(true)}><Plus />Create Class Representative</Button></div>
    <Card><CardHeader><CardTitle>Accounts</CardTitle></CardHeader><CardContent><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Section</th><th className="p-2">Academic Year</th><th className="p-2">Status</th></tr></thead><tbody>{(reps.data?.data ?? []).map((rep: any) => <tr className="border-b" key={rep.id + "-" + (rep.assignment_id ?? "none")}><td className="p-2">{rep.full_name}</td><td className="p-2">{rep.email}</td><td className="p-2">{rep.program_code ? rep.program_code + " " + rep.section_name : "Unassigned"}</td><td className="p-2">{rep.academic_year ?? "—"}</td><td className="p-2">{rep.is_active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Create Class Representative</DialogTitle></DialogHeader><div className="space-y-4">
      {([["first_name","First Name"],["middle_initial","Middle Initial"],["last_name","Last Name"],["extension","Extension"],["email","Email"]] as const).map(([field,label]) => <div className="space-y-2" key={field}><Label htmlFor={field}>{label}{["first_name","last_name","email"].includes(field) ? " *" : ""}</Label><Input id={field} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></div>)}
      <div className="space-y-2"><Label>Academic Year</Label><Select value={form.academic_year_id} onValueChange={(value) => setForm({ ...form, academic_year_id: value, section_id: "" })}><SelectTrigger><SelectValue placeholder="Select academic year" /></SelectTrigger><SelectContent>{(years.data?.data ?? []).map((year: any) => <SelectItem key={year.id} value={year.id}>{year.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Section</Label><Select value={form.section_id} onValueChange={(value) => setForm({ ...form, section_id: value })} disabled={!form.academic_year_id}><SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger><SelectContent>{(sections.data?.data ?? []).map((section: any) => <SelectItem key={section.id} value={section.id}>{section.program_code} {section.section_code} · {section.year_level}</SelectItem>)}</SelectContent></Select></div>
      <p className="text-xs text-muted-foreground">The initial password is {"Change" + "ThisPassword"}. The account is required to change it after first login. If email delivery is enabled, the credentials are sent automatically.</p>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void create()}>Create account</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
