import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect, useSearch } from "@tanstack/react-router"
import { Html5Qrcode } from "html5-qrcode"
import {
  Camera,
  CameraOff,
  CheckCircle,
  CloudUpload,
  Download,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { StudentPublic } from "@/client"
import {
  AttendeesService,
  AttendanceService,
  EventsService,
  StudentsService,
  UsersService,
} from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { QueuedScanRecord, RosterRecord } from "@/data"
import {
  enqueueScan,
  getAllQueuedScans,
  getPendingScans,
  getRoster,
  getRosterEntryByCredential,
  putRoster,
  QUEUE_CHANGED_EVENT,
  ROSTER_CHANGED_EVENT,
} from "@/data"
import {
  registerAttendanceSync,
  requestImmediateSync,
  setupSyncStatusListener,
} from "@/data/sync"

type ScanAction = "time_in" | "time_out"

function extractNfcCredential(event: any): string {
  const msg = event.message
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  if (msg?.records && Array.isArray(msg.records)) {
    for (const r of msg.records) {
      if (r.recordType === "text" && r.data instanceof DataView) {
        const dv = r.data as DataView
        if (dv.byteLength === 0) continue
        const status = dv.getUint8(0)
        const isUtf16 = (status & 0x80) !== 0
        const langLen = status & 0x3f
        const start = 1 + langLen
        if (start >= dv.byteLength) continue
        const bytes = new Uint8Array(
          dv.buffer,
          dv.byteOffset + start,
          dv.byteLength - start,
        )
        const uid = new TextDecoder(isUtf16 ? "utf-16" : "utf-8")
          .decode(bytes)
          .trim()
        if (uid) return uid
      }
    }
  }
  return ""
}

export const Route = createFileRoute("/_layout/scanner")({
  component: Scanner,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe().catch(() => ({
      data: null,
    }))
    if (
      !user ||
      (!user.is_superuser &&
        user.role !== "admin" &&
        user.role !== "super_admin" &&
        user.role !== "developer" &&
        !user.can_scan)
    ) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Scanner - Event Attendance Tracker",
      },
    ],
  }),
})

function useSyncStatus(eventId?: string) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pendingScans, setPendingScans] = useState<QueuedScanRecord[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [roster, setRoster] = useState<RosterRecord | null>(null)
  const [isDownloadingRoster, setIsDownloadingRoster] = useState(false)

  const reload = useCallback(async () => {
    try {
      const scans = await getPendingScans()
      setPendingScans(scans)
    } catch {
      setPendingScans([])
    }
  }, [])

  const reloadRoster = useCallback(async () => {
    if (!eventId) {
      setRoster(null)
      return
    }
    try {
      const stored = await getRoster(eventId)
      setRoster(stored ?? null)
    } catch {
      setRoster(null)
    }
  }, [eventId])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      void reload()
    }
    const handleOffline = () => setOnline(false)
    const handleQueueChanged = () => void reload()
    const handleRosterChanged = () => void reloadRoster()
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void reload()
        void reloadRoster()
      }
    }
    const unsubscribe = setupSyncStatusListener({
      onSyncStart: () => setIsSyncing(true),
      onSyncEnd: () => {
        setIsSyncing(false)
        void reload()
      },
    })

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged)
    window.addEventListener(ROSTER_CHANGED_EVENT, handleRosterChanged)
    document.addEventListener("visibilitychange", handleVisibility)
    void reload()
    void reloadRoster()

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged)
      window.removeEventListener(ROSTER_CHANGED_EVENT, handleRosterChanged)
      document.removeEventListener("visibilitychange", handleVisibility)
      unsubscribe()
    }
  }, [reload, reloadRoster])

  const retrySync = useCallback(() => {
    setIsSyncing(true)
    void registerAttendanceSync()
    void requestImmediateSync()
    window.setTimeout(() => {
      setIsSyncing(false)
      void reload()
    }, 10_000)
  }, [reload])

  const downloadRoster = useCallback(async () => {
    if (!eventId) return
    setIsDownloadingRoster(true)
    try {
      const result = await EventsService.readEventRoster({
        path: { event_id: eventId },
      })
      const entries = (result.data?.data ?? []).map((entry) => ({
        event_id: entry.event_id,
        attendee_id: entry.attendee_id,
        registration_status: entry.registration_status,
        person_name: entry.person_name,
        student_number: entry.student_number ?? undefined,
        credentials: (entry.credentials ?? []).map((credential) => ({
          credential_type: credential.credential_type,
          credential_value: credential.credential_value,
          is_active: credential.is_active,
        })),
      }))
      await putRoster({
        event_id: eventId,
        entries,
        downloaded_at: new Date().toISOString(),
        entry_count: entries.length,
        credential_count: entries.reduce(
          (total, entry) => total + entry.credentials.length,
          0,
        ),
      })
      toast.success("Roster downloaded for offline scanning")
    } catch {
      toast.error("Failed to download roster")
    } finally {
      setIsDownloadingRoster(false)
    }
  }, [eventId])

  return {
    online,
    pendingScans,
    isSyncing,
    retrySync,
    roster,
    isDownloadingRoster,
    downloadRoster,
  }
}

function SyncStatusCard({
  online,
  pendingScans,
  isSyncing,
  onRetry,
  roster,
  isDownloadingRoster,
  onDownloadRoster,
  eventId,
}: {
  online: boolean
  pendingScans: QueuedScanRecord[]
  isSyncing: boolean
  onRetry: () => void
  roster: RosterRecord | null
  isDownloadingRoster: boolean
  onDownloadRoster: () => void
  eventId?: string
}) {
  const pendingCount = pendingScans.length
  const failedScans = pendingScans.filter((scan) => Boolean(scan.last_error))
  const failedCodes = [
    ...new Set(failedScans.map((scan) => scan.last_error).filter(Boolean)),
  ]

  return (
    <Card data-testid="sync-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Sync Status
          {!online && (
            <Badge variant="outline">
              <WifiOff className="mr-1 h-3 w-3" />
              Offline
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSyncing ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing {pendingCount} pending scan{pendingCount === 1 ? "" : "s"}
            ...
          </div>
        ) : online && pendingCount === 0 ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            All synced
          </div>
        ) : online && pendingCount > 0 ? (
          <div className="flex items-center gap-2 text-amber-600">
            <CloudUpload className="h-4 w-4" />
            {pendingCount} pending sync
          </div>
        ) : !online && pendingCount > 0 ? (
          <div className="flex items-center gap-2 text-amber-600">
            <WifiOff className="h-4 w-4" />
            {pendingCount} queued locally - will sync when back online
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <WifiOff className="h-4 w-4" />
            No pending scans
          </div>
        )}

        {failedScans.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4" />
              Some scans failed to sync
              {failedCodes.length > 0 ? ` (${failedCodes.join(", ")})` : ""}
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          </div>
        )}

        {!isSyncing &&
          online &&
          pendingCount > 0 &&
          failedScans.length === 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Sync now
              </Button>
            </div>
          )}

        {eventId && (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {roster
                ? `${roster.entry_count} attendees on offline roster`
                : "Roster not downloaded for this event"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadRoster}
              disabled={!online || isDownloadingRoster}
            >
              <Download className="mr-1 h-3 w-3" />
              {isDownloadingRoster ? "Downloading..." : "Download roster"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Scanner() {
  const search = useSearch({ strict: false }) as any
  const eventId = (search as any)?.event_id as string | undefined
  const syncStatus = useSyncStatus(eventId)

  const [scanning, setScanning] = useState(false)
  const [nfcUid, setNfcUid] = useState("")
  const [nfcSupported, setNfcSupported] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [scanAction, setScanAction] = useState<ScanAction>("time_in")
  const [manualSearch, setManualSearch] = useState("")
  const ndefRef = useRef<any>(null)
  const nfcHandlerRef = useRef<((event: any) => void) | null>(null)
  const nfcTimeoutRef = useRef<number | null>(null)
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null)
  const [qrScanning, setQrScanning] = useState(false)
  const [qrSupported, setQrSupported] = useState(false)
  const [qrPermissionGranted, setQrPermissionGranted] = useState(false)
  const [lastScannedCredential, setLastScannedCredential] = useState<
    string | null
  >(null)
  const [lastScanTime, setLastScanTime] = useState<number>(0)

  const queueScan = useCallback(
    async (credentialValue: string, scanMethod: "nfc" | "qr" | "manual") => {
      if (!eventId) {
        toast.error("Please select an event first")
        return
      }
      if (!navigator.onLine) {
        try {
          const entry = await getRosterEntryByCredential(
            eventId,
            credentialValue,
          )
          if (!entry) {
            toast.error("No offline roster entry for this credential")
            return
          }
          const queued = await getAllQueuedScans()
          const isDuplicate = queued.some(
            (record) =>
              !record.synced &&
              record.event_id === eventId &&
              record.credential_value.toUpperCase() ===
                credentialValue.toUpperCase(),
          )
          if (isDuplicate) {
            toast.info("Already queued for this attendee")
            return
          }
          await enqueueScan({
            event_id: eventId,
            credential_value: credentialValue,
            scan_method: scanMethod,
          })
          toast.success(`Scan queued - ${entry.person_name}`)
        } catch {
          toast.error("Failed to queue scan")
        }
        return
      }
      try {
        await enqueueScan({
          event_id: eventId,
          credential_value: credentialValue,
          scan_method: scanMethod,
        })
        toast.success("Scan queued locally - waiting to sync")
      } catch {
        toast.error("Failed to queue scan")
      }
    },
    [eventId],
  )

  const handleNfcLookup = useCallback(
    async (uid: string) => {
      await queueScan(uid, "nfc")
    },
    [queueScan],
  )

  const handleQrLookup = useCallback(
    async (credentialValue: string) => {
      await queueScan(credentialValue, "qr")
    },
    [queueScan],
  )

  const checkNfcSupport = useCallback(() => {
    const supported = "NDEFReader" in window
    setNfcSupported(supported)
    return supported
  }, [])

  const scanNfc = useCallback(async () => {
    if (!checkNfcSupport()) return

    try {
      setScanning(true)
      const ndef = new (window as any).NDEFReader()
      await ndef.scan()
      setPermissionGranted(true)

      const handleReading = (event: any) => {
        if (nfcTimeoutRef.current !== null) {
          window.clearTimeout(nfcTimeoutRef.current)
          nfcTimeoutRef.current = null
        }
        const credential = extractNfcCredential(event)
        if (!credential) {
          toast.error(
            "No credential found. Ensure the tag contains an NDEF text record.",
          )
          ndef.removeEventListener("reading", handleReading)
          nfcHandlerRef.current = null
          ndefRef.current = null
          setScanning(false)
          return
        }
        const formatted = credential.toUpperCase()
        setNfcUid(formatted)
        ndef.removeEventListener("reading", handleReading)
        nfcHandlerRef.current = null
        ndefRef.current = null
        setScanning(false)
        handleNfcLookup(formatted)
      }

      ndef.addEventListener("reading", handleReading)
      ndefRef.current = ndef
      nfcHandlerRef.current = handleReading

      nfcTimeoutRef.current = window.setTimeout(() => {
        ndef.removeEventListener("reading", handleReading)
        nfcHandlerRef.current = null
        ndefRef.current = null
        nfcTimeoutRef.current = null
        setScanning(false)
        toast.error("Scan timeout. Please try again.")
      }, 30000)
    } catch (error) {
      if (nfcTimeoutRef.current !== null) {
        window.clearTimeout(nfcTimeoutRef.current)
        nfcTimeoutRef.current = null
      }
      setScanning(false)
      ndefRef.current = null
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          toast.error(
            "NFC permission denied. Please allow NFC access in browser settings.",
          )
          setPermissionGranted(false)
        } else {
          toast.error(`NFC error: ${error.message}`)
        }
      }
    }
  }, [checkNfcSupport, handleNfcLookup])

  useEffect(() => {
    return () => {
      if (nfcTimeoutRef.current !== null)
        window.clearTimeout(nfcTimeoutRef.current)
      if (ndefRef.current && nfcHandlerRef.current) {
        ndefRef.current.removeEventListener("reading", nfcHandlerRef.current)
      }
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop().catch(() => {})
        html5QrcodeRef.current = null
      }
    }
  }, [])

  const checkQrSupport = useCallback(() => {
    const supported = typeof Html5Qrcode !== "undefined"
    setQrSupported(supported)
    return supported
  }, [])

  useEffect(() => {
    checkNfcSupport()
    checkQrSupport()
  }, [checkNfcSupport, checkQrSupport])

  const scanQr = useCallback(async () => {
    if (!checkQrSupport()) return

    try {
      setQrScanning(true)
      const html5Qrcode = new Html5Qrcode("qr-reader")
      html5QrcodeRef.current = html5Qrcode

      await html5Qrcode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText, _decodedResult) => {
          // Prevent duplicate scans within 2 seconds
          const now = Date.now()
          if (
            decodedText === lastScannedCredential &&
            now - lastScanTime < 2000
          ) {
            return
          }
          setLastScannedCredential(decodedText)
          setLastScanTime(now)

          html5Qrcode.stop().catch(() => {})
          html5QrcodeRef.current = null
          setQrScanning(false)
          setQrPermissionGranted(true)
          handleQrLookup(decodedText)
        },
        (_errorMessage) => {
          // Ignore scan errors (no QR code in frame)
        },
      )
      setQrPermissionGranted(true)
    } catch (error) {
      setQrScanning(false)
      if (error instanceof Error) {
        if (
          error.name === "NotAllowedError" ||
          error.message.includes("permission")
        ) {
          toast.error(
            "Camera permission denied. Please allow camera access in browser settings.",
          )
          setQrPermissionGranted(false)
        } else {
          toast.error(`QR scan error: ${error.message}`)
        }
      }
    }
  }, [checkQrSupport, lastScannedCredential, lastScanTime, handleQrLookup])

  const stopQrScanning = useCallback(() => {
    if (html5QrcodeRef.current) {
      html5QrcodeRef.current.stop().catch(() => {})
      html5QrcodeRef.current = null
      setQrScanning(false)
    }
  }, [])

  const manualLookupMutation = useMutation({
    mutationFn: (query: string) =>
      StudentsService.readStudents({
        query: { skip: 0, limit: 10, search: query },
        throwOnError: false,
      }),
    onSuccess: async (result) => {
      if (!eventId) {
        toast.error("Please select an event first")
        return
      }
      const students = result.data?.data ?? []
      if (students.length === 0) {
        toast.error("No student found")
      } else if (students.length === 1) {
        await submitManualScan(students[0])
      } else {
        setManualResults(students)
        setShowManualPicker(true)
      }
    },
    onError: () => {
      toast.error("Search failed")
    },
  })

  const [manualResults, setManualResults] = useState<StudentPublic[]>([])
  const [showManualPicker, setShowManualPicker] = useState(false)

  const submitManualScan = async (student: StudentPublic) => {
    try {
      if (!eventId) {
        toast.error("No event selected")
        return
      }
      const attendeeResp = await AttendeesService.readAttendees({
        query: { person_id: student.person_id ?? "", limit: 1 },
        throwOnError: false,
      })
      const attendeeId = attendeeResp.data?.data?.[0]?.id
      if (!attendeeId) {
        toast.error("No attendee record found for this student")
        return
      }
      const scanResp = await AttendanceService.scanAttendanceManual(
        {
          body: { event_id: eventId, attendee_id: attendeeId, scan_method: "manual" },
          throwOnError: false,
        },
      )
      if (scanResp.error) {
        const status = (scanResp as any).status
        if (status === 409) {
          const data = (scanResp as any).data
          const already = data?.detail?.includes("Completed")
            ? "Already completed"
            : data?.detail?.includes("Already Recorded")
              ? "Already recorded (in: " + data?.detail?.match(/In: (\S+)/)?.[1] + ")"
              : "Already recorded"
          toast.error(already)
        } else {
          toast.error((scanResp as any).data?.detail ?? "Scan failed")
        }
        return
      }
      const data = scanResp.data
      toast.success(`Recorded ${student.person_name ?? student.student_number} (${data.message})`)
    } catch {
      toast.error("Failed to submit manual scan")
    } finally {
      setShowManualPicker(false)
      setManualResults([])
      setManualSearch("")
    }
  }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualSearch.trim()) {
      setShowManualPicker(false)
      setManualResults([])
      manualLookupMutation.mutate(manualSearch.trim())
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance Scanner
          </h1>
          <p className="text-muted-foreground">
            Scan student IDs or search manually
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={scanAction}
            onValueChange={(value) => setScanAction(value as ScanAction)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time_in">Time-In</SelectItem>
              <SelectItem value="time_out">Time-Out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {scanning ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : permissionGranted ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <Wifi className="h-5 w-5 text-muted-foreground" />
            )}
            NFC Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!nfcSupported && (
            <p className="text-sm text-muted-foreground">
              Web NFC is not supported in this browser. Use QR scanning or
              manual search instead.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="8F:49:5B:74"
              value={nfcUid}
              onChange={(e) => setNfcUid(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nfcUid.trim()) {
                  e.preventDefault()
                  void handleNfcLookup(nfcUid.trim().toUpperCase())
                }
              }}
              disabled={scanning}
              className="flex-1 font-mono"
            />
            <LoadingButton
              loading={scanning}
              onClick={scanNfc}
              disabled={scanning || !nfcSupported}
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : !permissionGranted ? (
                "Request Permission"
              ) : (
                "Scan NFC Tag"
              )}
            </LoadingButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {qrScanning ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
            QR Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!qrSupported ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <CameraOff className="h-6 w-6" />
              <p className="text-sm">
                QR scanning is not supported in this browser or device.
              </p>
            </div>
          ) : (
            <>
              <div id="qr-reader" className="overflow-hidden rounded-lg" />
              <div className="flex gap-2">
                <LoadingButton
                  loading={qrScanning}
                  onClick={scanQr}
                  disabled={qrScanning}
                  className="flex-1"
                >
                  {qrScanning ? "Scanning QR..." : "Start QR Scanner"}
                </LoadingButton>
                <Button
                  variant="outline"
                  onClick={stopQrScanning}
                  disabled={!qrScanning}
                >
                  Stop
                </Button>
              </div>
              {!qrPermissionGranted && (
                <p className="text-sm text-muted-foreground">
                  Camera permission is requested when scanning starts.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Manual Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <Input
              placeholder="Search by student number or name..."
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              className="flex-1"
            />
            <LoadingButton
              loading={manualLookupMutation.isPending}
              type="submit"
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </LoadingButton>
          </form>
          {showManualPicker && manualResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {manualResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => submitManualScan(s)}
                  className="w-full text-left px-3 py-2 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="font-medium">{s.person_name ?? s.student_number}</div>
                  <div className="text-sm text-muted-foreground">{s.student_number}</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SyncStatusCard
        online={syncStatus.online}
        pendingScans={syncStatus.pendingScans}
        isSyncing={syncStatus.isSyncing}
        onRetry={syncStatus.retrySync}
        roster={syncStatus.roster}
        isDownloadingRoster={syncStatus.isDownloadingRoster}
        onDownloadRoster={syncStatus.downloadRoster}
        eventId={eventId}
      />
    </div>
  )
}

export default Scanner
