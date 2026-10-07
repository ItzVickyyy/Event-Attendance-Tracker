import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type AuditEntry = {
  id: string
  actor_user_id: string | null
  action: string
  resource: string
  method: string
  path: string
  status_code: number
  outcome: "success" | "failure"
  duration_ms: number
  occurred_at: string
}

type AuditResponse = {
  data: AuditEntry[]
  count: number
  limit: number
  offset: number
}

async function fetchAuditLogs(action: string, outcome: string, offset: number) {
  const token = localStorage.getItem("access_token")
  const params = new URLSearchParams({ limit: "25", offset: String(offset) })
  if (action.trim()) params.set("action", action.trim())
  if (outcome !== "all") params.set("outcome", outcome)
  const baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  const response = await fetch(
    `${baseUrl}/api/v1/developer/audit-logs?${params.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? "Unable to load audit logs")
  }
  return (await response.json()) as AuditResponse
}

export function AuditLogsPanel() {
  const [actionInput, setActionInput] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [outcome, setOutcome] = useState("all")
  const [offset, setOffset] = useState(0)
  const query = useQuery({
    queryKey: ["developer", "audit-logs", actionFilter, outcome, offset],
    queryFn: () => fetchAuditLogs(actionFilter, outcome, offset),
  })

  const applyFilters = () => {
    setOffset(0)
    setActionFilter(actionInput)
  }

  return (
    <section aria-label="Audit logs" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Audit logs</h2>
        <p className="text-sm text-muted-foreground">
          Authenticated API changes, response outcomes, and request timing. Payloads and credentials are never stored.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>
            {query.data ? `${query.data.count} matching entries` : "Review recorded API changes"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 space-y-1 text-sm">
              <span className="text-muted-foreground">Action</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={actionInput}
                onChange={(event) => setActionInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
                placeholder="Filter by action"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Outcome</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 sm:w-40"
                value={outcome}
                onChange={(event) => {
                  setOutcome(event.target.value)
                  setOffset(0)
                }}
              >
                <option value="all">All outcomes</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </div>

          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading audit logs…</p>
          ) : query.isError ? (
            <div className="space-y-2 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : "Unable to load audit logs"}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : query.data?.data.length ? (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-medium">Time (UTC)</th>
                      <th className="px-3 py-3 font-medium">Action</th>
                      <th className="px-3 py-3 font-medium">Resource</th>
                      <th className="px-3 py-3 font-medium">Actor ID</th>
                      <th className="px-3 py-3 font-medium">Result</th>
                      <th className="px-3 py-3 text-right font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {query.data.data.map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                          {new Date(entry.occurred_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 font-medium">{entry.action}</td>
                        <td className="max-w-sm break-all px-3 py-3">
                          <div>{entry.resource}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.method} · HTTP {entry.status_code}
                          </div>
                        </td>
                        <td className="max-w-[160px] break-all px-3 py-3 font-mono text-xs">
                          {entry.actor_user_id ?? "Unknown"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={entry.outcome === "success" ? "secondary" : "destructive"}>
                            {entry.outcome}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                          {entry.duration_ms.toFixed(2)} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + query.data.data.length, query.data.count)} of {query.data.count}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 25))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offset + 25 >= query.data.count}
                    onClick={() => setOffset(offset + 25)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No audit entries match these filters yet.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
