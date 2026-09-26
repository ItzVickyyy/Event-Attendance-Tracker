import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Activity, ClipboardCheck, KeyRound, Shield, Users } from "lucide-react"
import { UsersService, AttendanceCorrectionsService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const items = [
  { to: "/administration/users", title: "User Accounts", description: "View and manage application user accounts.", icon: Users },
  { to: "/administration/roles", title: "Roles & Permissions", description: "Review application roles and their available permission controls.", icon: Shield },
  { to: "/administration/attendance", title: "Attendance Administration", description: "Review controlled attendance corrections and their reasons.", icon: ClipboardCheck },
  { to: "/administration/scanner-permissions", title: "Scanner Permissions", description: "Manage explicit attendance scanning capability without creating a scanner role.", icon: KeyRound },
  { to: "/administration/audit-logs", title: "Audit Logs", description: "Review audit information when the backend exposes it.", icon: Activity },
]

export function AdministrationWorkspace() {
  const users = useQuery({ queryKey: ["admin-users-summary"], queryFn: () => UsersService.readUsers({ query: { skip: 0, limit: 1000 } }) })
  const corrections = useQuery({ queryKey: ["admin-corrections-summary"], queryFn: () => AttendanceCorrectionsService.readAttendanceCorrections({ query: { skip: 0, limit: 1000 } }) })
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">Administration</h1><p className="mt-1 text-sm text-muted-foreground">Operational administration for users, permissions, attendance, and auditing.</p></div><div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm font-medium">User Accounts</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{users.isLoading ? "—" : users.data?.data.count ?? 0}</p><p className="text-xs text-muted-foreground">accounts visible to the current administrator</p></CardContent></Card><Card><CardHeader><CardTitle className="text-sm font-medium">Attendance Corrections</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{corrections.isLoading ? "—" : corrections.data?.data.count ?? 0}</p><p className="text-xs text-muted-foreground">existing correction records</p></CardContent></Card></div><div className="grid gap-4 md:grid-cols-2">{items.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group"><Card className="h-full transition-colors group-hover:bg-muted/40"><CardHeader><div className="flex items-center gap-3"><div className="rounded-lg border p-2"><Icon className="h-5 w-5" /></div><CardTitle className="text-base">{title}</CardTitle></div></CardHeader><CardContent><p className="text-sm text-muted-foreground">{description}</p></CardContent></Card></Link>)}</div></div>
}
