import { ArrowRight, Search, UsersRound } from "lucide-react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { PlaceholderPage } from "@/components/Reconstruction/PlaceholderPage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/_layout/sections")({
  component: Sections,
  head: () => ({ meta: [{ title: "Sections & Students - Event Attendance Tracker" }] }),
})

function Sections() {
  return (
    <PlaceholderPage
      title="Sections & Students"
      description="Browse students through their academic section, with global student search kept as a separate lookup path."
      detail="Phase 1 establishes Sections as the primary browsing entry point. Section data and student management will be connected in a later phase."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UsersRound className="size-5" />Sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Section List is the primary entry point for student records.</p>
            <Button variant="outline" asChild><Link to="/sections">Open Section List <ArrowRight /></Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="size-5" />Global Student Search</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">A dedicated lookup mechanism will resolve a student to their section in a later phase.</p>
          </CardContent>
        </Card>
      </div>
    </PlaceholderPage>
  )
}
