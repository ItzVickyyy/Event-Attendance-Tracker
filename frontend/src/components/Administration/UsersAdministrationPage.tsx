import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { UsersService, type UserPublic, type UserRole } from "@/client"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const roles: UserRole[] = ["developer", "super_admin", "admin", "class_representative", "student"]
const accountRoles: UserRole[] = ["developer", "super_admin", "admin", "class_representative"]

export function UsersAdministrationPage() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("admin")
  const [isDeveloper, setIsDeveloper] = useState(false)
  const query = useQuery({ queryKey: ["admin-users"], queryFn: () => UsersService.readUsers({ query: { skip: 0, limit: 1000 } }) })
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof UsersService.updateUser>[0]["body"] }) => UsersService.updateUser({ path: { user_id: id }, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  })
  const createMutation = useMutation({
    mutationFn: () => UsersService.createUser({ body: {
      email,
      password,
      full_name: name || undefined,
      role,
      is_superuser: role === "super_admin",
      is_developer: isDeveloper || role === "developer",
      can_scan: role !== "class_representative" && role !== "developer",
      is_active: true,
    } }),
    onSuccess: () => {
      toast.success("Account created")
      setCreateOpen(false)
      setName("")
      setEmail("")
      setPassword("")
      setRole("admin")
      setIsDeveloper(false)
      void qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: () => toast.error("Unable to create account"),
  })
  const users = (query.data?.data.data ?? []).filter((u: UserPublic) => `${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(q.toLowerCase()))

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold">User Accounts</h1><p className="mt-1 text-sm text-muted-foreground">Create and manage Developer, Super Admin, Admin, and Class Representative accounts.</p></div><Button onClick={() => setCreateOpen(true)}><Plus />Add account</Button></div>
    <Input placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} />
    {query.isError && <Card><CardContent className="py-8 text-center text-sm text-destructive">Unable to load users.</CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">Accounts</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Developer</th><th className="p-3">Active</th><th className="p-3">Scanner</th><th className="p-3">Action</th></tr></thead><tbody>{users.map((u: UserPublic) => <UserRow key={u.id} user={u} onSave={(body) => mutation.mutate({ id: u.id, body })} saving={mutation.isPending} />)}</tbody></table>{!query.isLoading && users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>}</CardContent></Card>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Add account</DialogTitle><DialogDescription>Create an application account. Organizational officer positions and class representative section assignments are stored separately.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><span className="text-sm font-medium">Full name</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></div><div className="space-y-2"><span className="text-sm font-medium">Email</span><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" /></div><div className="space-y-2"><span className="text-sm font-medium">Temporary password</span><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" /></div><div className="space-y-2"><span className="text-sm font-medium">Role</span><Select value={role} onValueChange={(value) => { const nextRole = value as UserRole; setRole(nextRole); if (nextRole === "developer") setIsDeveloper(true) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{accountRoles.map((item) => <SelectItem key={item} value={item}>{item.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div><label className="flex items-start gap-3 rounded-md border p-3 text-sm"><Checkbox checked={isDeveloper || role === "developer"} disabled={role === "developer"} onCheckedChange={(checked) => setIsDeveloper(checked === true)} /><span><span className="font-medium">Developer access</span><span className="block text-muted-foreground">Enables the technical system dashboard independently of the account's application role.</span></span></label></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} disabled={!email || password.length < 8 || createMutation.isPending}>{createMutation.isPending ? "Creating…" : "Create account"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function UserRow({ user, onSave, saving }: { user: UserPublic; onSave: (body: Parameters<typeof UsersService.updateUser>[0]["body"]) => void; saving: boolean }) {
  const [role, setRole] = useState<UserRole>(user.role ?? "student")
  const [active, setActive] = useState(Boolean(user.is_active))
  const [scan, setScan] = useState(Boolean(user.can_scan))
  const [isDeveloper, setIsDeveloper] = useState(Boolean(user.is_developer || user.role === "developer"))
  return <tr className="border-b"><td className="p-3 font-medium">{user.full_name || "—"}</td><td className="p-3">{user.email}</td><td className="p-3"><Select value={role} onValueChange={(v) => { const nextRole = v as UserRole; setRole(nextRole); if (nextRole === "developer") setIsDeveloper(true) }}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Button size="sm" variant={isDeveloper || role === "developer" ? "default" : "outline"} disabled={role === "developer"} onClick={() => setIsDeveloper(!isDeveloper)}>{isDeveloper || role === "developer" ? "Enabled" : "Disabled"}</Button></td><td className="p-3"><Button size="sm" variant={active ? "default" : "outline"} onClick={() => setActive(!active)}>{active ? "Active" : "Inactive"}</Button></td><td className="p-3"><Button size="sm" variant={scan ? "default" : "outline"} onClick={() => setScan(!scan)}>{scan ? "Allowed" : "Denied"}</Button></td><td className="p-3"><Button size="sm" onClick={() => onSave({ role, is_active: active, can_scan: scan, is_developer: isDeveloper || role === "developer", is_superuser: role === "developer" ? false : Boolean(user.is_superuser || role === "super_admin") })} disabled={saving}>Save</Button></td></tr>
}
