import { useQuery } from "@tanstack/react-query"
import { BookOpen, CalendarDays, UsersRound } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ClassRepresentativeDashboard() {
  const token = localStorage.getItem("access_token")
  const query = useQuery({
    queryKey: ["class-representative-assignment"],
    queryFn: async () => {
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      // The API selects the representative's most recent assignment when no
      // academic year is supplied. Class representatives cannot read the
      // admin-only global academic-year registry.
      const response = await fetch("/api/v1/class-representatives/me", {
        headers,
      })
      if (!response.ok) throw new Error("No section assignment found")
      return response.json()
    },
  })

  if (query.isPending) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading your section…
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">No section assigned</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No Class Representative assignment was found for your account.
            Please contact a Super Admin if you believe this is a mistake.
          </p>
        </CardContent>
      </Card>
    )
  }

  const section = query.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your Class Representative overview.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BookOpen />
              Section
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {section.program_code} {section.section_name}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UsersRound />
              Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{section.student_count}</p>
            <p className="text-sm text-muted-foreground">
              students in your section
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays />
              Academic Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{section.academic_year}</p>
            <p className="text-sm text-muted-foreground">
              assigned academic year
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
