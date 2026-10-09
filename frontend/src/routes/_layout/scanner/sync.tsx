import { createFileRoute } from "@tanstack/react-router"
import { RefreshCw, Wifi, WifiOff } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAllQueuedScans, type QueuedScanRecord } from "@/data"
import { syncNow } from "@/data/sync"

export const Route = createFileRoute("/_layout/scanner/sync")({
  component: SyncQueuePage,
})

function SyncQueuePage() {
  const [records, setRecords] = useState<QueuedScanRecord[]>([])
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(async () => {
    setRecords(await getAllQueuedScans())
  }, [])

  useEffect(() => {
    void reload()
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    window.addEventListener("online", onlineHandler)
    window.addEventListener("offline", offlineHandler)
    return () => {
      window.removeEventListener("online", onlineHandler)
      window.removeEventListener("offline", offlineHandler)
    }
  }, [reload])

  async function runSync() {
    setSyncing(true)
    try {
      const result = await syncNow()
      await reload()
      if (result.authRequired)
        toast.error("Sign in again to sync pending scans")
      else if (result.needsRetry) toast.error("Some scans still need retry")
      else toast.success("Sync completed")
    } catch {
      toast.error("Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  const pending = records.filter((r) => !r.synced)
  const rejected = records.filter((r) => r.sync_status === "REJECTED")
  const retry = records.filter((r) => r.sync_status === "RETRY")

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scanner Sync</h1>
          <p className="text-sm text-muted-foreground">
            Review queued, rejected, duplicate, and synchronized attendance
            records.
          </p>
        </div>
        <Button onClick={runSync} disabled={!online || syncing}>
          <RefreshCw
            className={syncing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"}
          />
          Sync now
        </Button>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Status
            label="Network"
            value={online ? "ONLINE" : "OFFLINE"}
            icon={online ? <Wifi /> : <WifiOff />}
          />
          <Status label="Pending" value={String(pending.length)} />
          <Status label="Retry" value={String(retry.length)} />
          <Status label="Rejected" value={String(rejected.length)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Queue History</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No queued attendance records.
            </p>
          ) : (
            <div className="space-y-2">
              {records
                .slice()
                .reverse()
                .map((record) => (
                  <div
                    key={record.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {record.scan_method.toUpperCase()} ·{" "}
                        {record.attendee_id ||
                          record.credential_value ||
                          "Manual"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.client_timestamp).toLocaleString()}
                      </p>
                      {record.last_error && (
                        <p className="text-xs text-destructive">
                          {record.last_error}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        record.synced
                          ? "default"
                          : record.sync_status === "REJECTED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {record.sync_status}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Status({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 font-semibold">
        {icon}
        {value}
      </p>
    </div>
  )
}
