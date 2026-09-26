import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SettingCapabilityPage({ title, description, capability }: { title: string; description: string; capability: string }) {
  return <div className="space-y-6"><Button variant="ghost" size="sm" asChild><Link to="/settings"><ArrowLeft />System Settings</Link></Button><Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent><div className="rounded-lg border bg-muted/30 p-4"><p className="text-sm font-medium">Configuration status</p><p className="mt-1 text-sm text-muted-foreground">{capability}</p><p className="mt-3 text-xs text-muted-foreground">No configuration value is changed here because the current frontend API does not expose a corresponding settings resource. This prevents the UI from inventing persistence that the backend does not support.</p></div></CardContent></Card></div>
}
