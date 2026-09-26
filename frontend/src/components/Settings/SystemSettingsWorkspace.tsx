import { Link } from "@tanstack/react-router"
import { Clock3, Building2, ListChecks } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const items = [
  { to: "/settings/attendance-rules", title: "Attendance Rules", description: "Manage the existing attendance grace period, cutoff, and related rules when supported by the backend.", icon: ListChecks },
  { to: "/settings/time-out", title: "Time-Out Settings", description: "Manage existing time-out configuration without overriding event-level attendance mode.", icon: Clock3 },
  { to: "/settings/organization", title: "Organization Settings", description: "Manage organization-level settings exposed by the existing system.", icon: Building2 },
] as const

export function SystemSettingsWorkspace() {
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">System Settings</h1><p className="text-sm text-muted-foreground">Organization-wide attendance and system configuration.</p></div><div className="grid gap-4 md:grid-cols-3">{items.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="block"><Card className="h-full transition-colors hover:bg-muted/50"><CardHeader><Icon className="h-5 w-5" /><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{description}</p></CardContent></Card></Link>)}</div></div>
}
