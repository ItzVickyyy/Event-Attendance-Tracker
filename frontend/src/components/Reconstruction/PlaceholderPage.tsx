import type { ReactNode } from "react"
import { Construction } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface PlaceholderPageProps {
  title: string
  description: string
  detail?: string
  children?: ReactNode
}

export function PlaceholderPage({ title, description, detail, children }: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Event Attendance Tracker</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </header>
      {children}
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="size-5 text-muted-foreground" />
            Reconstruction in progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>This route is part of the Phase 1 application shell.</p>
          <p>{detail ?? "The full feature will be rebuilt in a later reconstruction phase."}</p>
        </CardContent>
      </Card>
    </div>
  )
}
