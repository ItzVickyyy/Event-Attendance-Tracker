import { Link } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
const roles = [
  ["Developer", "developer", "Application development and system-level access."],
  ["Super Admin", "super_admin", "Sensitive organization-wide administrative controls."],
  ["Admin", "admin", "Normal operational administration."],
  ["Class Representative", "class_representative", "Assigned-section operational access."],
  ["Student", "student", "Self-only student access."],
]
export function RolesAdministrationPage() { return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Roles & Permissions</h1><p className="mt-1 text-sm text-muted-foreground">The application uses Role → Permissions → Data Scope → Available pages/actions.</p></div><div className="grid gap-4">{roles.map(([name, role, description]) => <Card key={role}><CardHeader><CardTitle className="text-base">{name}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{description}</p><p className="mt-2 text-xs font-mono text-muted-foreground">{role}</p></CardContent></Card>)}</div><p className="text-sm text-muted-foreground">Scanner access is intentionally represented by the separate can_scan capability, not a scanner-specific role.</p><Link className="text-sm underline" to="/administration/scanner-permissions">Manage scanner permissions</Link></div> }
