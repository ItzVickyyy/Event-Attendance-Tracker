import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
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
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { StudentPublic } from "@/client"
import {
  AttendanceService,
  AttendeesService,
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
import { Separator } from "@/components/ui/separator"
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
import { setupSyncStatusListener, syncNow } from "@/data/sync"
import { getActiveAttendanceSession, type AttendanceSession } from "@/data/attendanceSessions"

interface NfcDiagnosticRecord {
  recordType: string
  mediaType: string | null
  id: string | null
  dataLength: number | null
  decodedData: string | null
}

interface NfcDiagnostic {
  timestamp: string
  serialNumber: string | null
  recordCount: number
  records: NfcDiagnosticRecord[]
}

/**
 * Normalizes a raw NFC credential value (from an NDEF text record or the
 * tag's `serialNumber`) into the canonical form used by the backend's
 * `AttendeeCredential.credential_value` column: uppercase, separators
 * preserved as-is (the DB already stores values like "8F:49:5B:74").
 */
function normalizeNfcCredential(raw: string): string {
  return raw.trim().toUpperCase()
}

function extractNfcCredential(event: any): string {
  const msg = event.message
  if (typeof msg === "string" && msg.trim()) return normalizeNfcCredential(msg)
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
        if (uid) return normalizeNfcCredential(uid)
      }
    }
  }
  // No usable NDEF text credential was found. Many physical tags (e.g.
  // blank/empty NDEF records) only expose their identity via the Web NFC
  // `serialNumber`, so fall back to that.
  if (typeof event.serialNumber === "string" && event.serialNumber.trim()) {
    return normalizeNfcCredential(event.serialNumber)
  }
  return ""
}

export const Route = createFileRoute("/_layout/scanner")({
  validateSearch: (search: Record<string, unknown>) => ({
    event_id: (search.event_id as string) || undefined,
  }),
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
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)

  const reload = useCallback(async () => {
    try { setPendingScans(await getPendingScans()) } catch { setPendingScans([]) }
  }, [])

  const reloadRoster = useCallback(async () => {
    if (!eventId) { setRoster(null); return }
    try { setRoster((await getRoster(eventId)) ?? null) } catch { setRoster(null) }
  }, [eventId])

  const reloadActiveSession = useCallback(async () => {
    if (!eventId) { setActiveSession(null); return }
    setActiveSession(await getActiveAttendanceSession(eventId))
  }, [eventId])

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void reload(); void reloadActiveSession() }
    const handleOffline = () => setOnline(false)
    const handleQueueChanged = () => void reload()
    const handleRosterChanged = () => void reloadRoster()
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void reload()
        void reloadRoster()
        void reloadActiveSession()
      }
    }
    const unsubscribe = setupSyncStatusListener({
      onSyncStart: () => setIsSyncing(true),
      onSyncEnd: () => { setIsSyncing(false); void reload() },
    })
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged)
    window.addEventListener(ROSTER_CHANGED_EVENT, handleRosterChanged)
    document.addEventListener("visibilitychange", handleVisibility)
    void reload()
    void reloadRoster()
    void reloadActiveSession()
    const interval = window.setInterval(() => void reloadActiveSession(), 3000)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged)
      window.removeEventListener(ROSTER_CHANGED_EVENT, handleRosterChanged)
      document.removeEventListener("visibilitychange", handleVisibility)
      unsubscribe()
    }
  }, [reload, reloadRoster, reloadActiveSession])

  const retrySync = useCallback(async () => {
    setIsSyncing(true)
    try {
      const result = await syncNow()
      if (result.mechanism === "foreground") {
        setIsSyncing(false)
        await reload()
        if (result.authRequired) toast.error("Sign in again to sync pending scans")
        else if (result.needsRetry) toast.error("Some scans failed to sync")
      }
    } catch {
      setIsSyncing(false)
      await reload()
      toast.error("Failed to sync pending scans")
    }
  }, [reload])

  const downloadRoster = useCallback(async () => {
    if (!eventId) return
    setIsDownloadingRoster(true)
    try {
      const result = await EventsService.readEventRoster({ path: { event_id: eventId } })
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
        credential_count: entries.reduce((total, entry) => total + entry.credentials.length, 0),
      })
      toast.success("Roster downloaded for offline scanning")
    } catch { toast.error("Failed to download roster") }
    finally { setIsDownloadingRoster(false) }
  }, [eventId])

  return { online, pendingScans, isSyncing, retrySync, roster, isDownloadingRoster, downloadRoster, activeSession }
}

function SyncStatusCard({
  online,
  pendingScans,
  isSyncing,
  onRetry,
  roster,
  isDownloadingRoster,
  onDownloadRoster,
  activeSession,
  eventId,
}: {
  online: boolean
  pendingScans: QueuedScanRecord[]
  isSyncing: boolean
  onRetry: () => void
  roster: RosterRecord | null
  isDownloadingRoster: boolean
  onDownloadRoster: () => void
  activeSession: AttendanceSession | null
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
        {activeSession ? (
          <div className="flex items-center justify-between border-b pb-3 text-sm">
            <span className="text-muted-foreground">Active session</span>
            <span className="font-medium">{activeSession.name} · {activeSession.session_type}</span>
          </div>
        ) : eventId ? (
          <div className="border-b pb-3 text-sm text-amber-600">No active attendance session</div>
        ) : null}

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
  const search = Route.useSearch()
  const navigate = useNavigate()
  const eventId = search.event_id
  const syncStatus = useSyncStatus(eventId)

  const { data: eventsResponse } = useQuery({
    queryKey: ["events"],
    queryFn: async () =>
      (await EventsService.readEvents({ query: { skip: 0, limit: 100 } })).data,
  })
  const events = eventsResponse?.data ?? []
  const currentEvent = events.find((e) => e.id === eventId)

  const [scanning, setScanning] = useState(false)
  const [nfcUid, setNfcUid] = useState("")
  const [nfcSupported, setNfcSupported] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
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
  const [lastResult, setLastResult] = useState<{
    type: "success" | "duplicate" | "error" | "info"
    message: string
    name?: string
    studentNumber?: string
    timestamp: string
  } | null>(null)

  // Temporary NFC diagnostic instrumentation (read-only, no effect on
  // production scanning). Driven by React state so it renders in the UI;
  // the same object is also exposed on `window` for console inspection.
  const [nfcDiagnostic, setNfcDiagnostic] = useState<NfcDiagnostic | null>(null)

  useEffect(() => {
    if (!lastResult) return
    const timer = window.setTimeout(() => setLastResult(null), 3500)
    return () => window.clearTimeout(timer)
  }, [lastResult])

  const stopNfcScanning = useCallback(() => {
    if (nfcTimeoutRef.current !== null) {
      window.clearTimeout(nfcTimeoutRef.current)
      nfcTimeoutRef.current = null
    }
    if (ndefRef.current && nfcHandlerRef.current) {
      ndefRef.current.removeEventListener("reading", nfcHandlerRef.current)
    }
    nfcHandlerRef.current = null
    ndefRef.current = null
    setScanning(false)
  }, [])

  const queueScan = useCallback(
    async (credentialValue: string, scanMethod: "nfc" | "qr") => {
      if (!eventId) { toast.error("Please select an event first"); return }
      const activeSession = await getActiveAttendanceSession(eventId)
      if (!activeSession) { toast.error("No active attendance session"); return }
      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

      if (navigator.onLine) {
        const result = await AttendanceService.scanAttendance({
          body: { event_id: eventId, credential_value: credentialValue, scan_method: scanMethod },
          headers: { "X-Attendance-Session-ID": activeSession.id },
          throwOnError: false,
        })
        if (!result.error) {
          setLastResult({
            type: "success",
            message: result.data?.message ?? "Attendance recorded",
            name: result.data?.person_name ?? undefined,
            studentNumber: result.data?.student_number ?? undefined,
            timestamp: nowStr,
          })
          toast.success(result.data?.message ?? "Attendance recorded")
          return
        }
        const statusCode = (result as any).status
        const detail = (result as any).data?.detail ?? "Scan failed"
        if (statusCode === 409) {
          setLastResult({ type: "duplicate", message: detail, timestamp: nowStr })
          toast.error(detail)
          return
        }
        if (statusCode && statusCode < 500) {
          setLastResult({ type: "error", message: detail, timestamp: nowStr })
          toast.error(detail)
          return
        }
        // A network/server failure falls through to the durable queue.
      }

      try {
        const entry = await getRosterEntryByCredential(eventId, credentialValue)
        if (!navigator.onLine && !entry) {
          setLastResult({ type: "error", message: "Credential not recognized in offline roster", timestamp: nowStr })
          toast.error("No offline roster entry for this credential")
          return
        }
        const queued = await getAllQueuedScans()
        const isDuplicate = queued.some(
          (record) =>
            !record.synced &&
            record.event_id === eventId &&
            record.attendance_session_id === activeSession.id &&
            record.credential_value.toUpperCase() === credentialValue.toUpperCase(),
        )
        if (isDuplicate) {
          setLastResult({
            type: "duplicate",
            message: "Already queued for this attendee",
            name: entry?.person_name,
            studentNumber: entry?.student_number,
            timestamp: nowStr,
          })
          toast.info("Already queued for this attendee")
          return
        }
        await enqueueScan({
          event_id: eventId,
          attendance_session_id: activeSession.id,
          credential_value: credentialValue,
          scan_method: scanMethod,
        })
        setLastResult({
          type: "success",
          message: navigator.onLine ? "Saved for automatic retry" : "Saved offline",
          name: entry?.person_name,
          studentNumber: entry?.student_number,
          timestamp: nowStr,
        })
        toast.success(navigator.onLine ? "Saved for automatic retry" : "Saved offline")
      } catch {
        setLastResult({ type: "error", message: "Failed to queue scan", timestamp: nowStr })
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

        // Temporary NFC diagnostic capture (read-only, no side effects on
        // production scanning/extraction below). Build one diagnostic
        // object and use it for both React state and the window globals,
        // so nothing here reads back stale state.
        {
          const msg = event.message
          const rawRecords: any[] =
            msg?.records && Array.isArray(msg.records) ? msg.records : []

          const records: NfcDiagnosticRecord[] = rawRecords.map((rec) => {
            const dv = rec?.data
            const dataLength = dv instanceof DataView ? dv.byteLength : null
            let decodedData: string | null = null
            if (dv instanceof DataView && dv.byteLength > 0) {
              const arr = new Uint8Array(
                dv.buffer,
                dv.byteOffset,
                dv.byteLength,
              )
              try {
                decodedData = new TextDecoder().decode(arr)
              } catch {
                try {
                  decodedData = new TextDecoder("utf-16").decode(arr)
                } catch {
                  decodedData = "Unable to decode"
                }
              }
            }
            return {
              recordType: rec?.recordType ?? "N/A",
              mediaType: rec?.mediaType ?? null,
              id: rec?.id || null,
              dataLength,
              decodedData,
            }
          })

          const diagnostic: NfcDiagnostic = {
            timestamp: new Date().toLocaleTimeString(),
            serialNumber: event.serialNumber ?? null,
            recordCount: rawRecords.length,
            records,
          }

          setNfcDiagnostic(diagnostic)

          if (typeof window !== "undefined") {
            ;(window as any).__lastNfcEvent = event
            ;(window as any).__lastNfcSerialNumber = diagnostic.serialNumber
            ;(window as any).__nfcDiagnosticLog = diagnostic
          }
          console.log("[NFC Diagnostic]", diagnostic)
        }

        const credential = extractNfcCredential(event)
        if (!credential) {
          toast.error(
            "No credential found. Ensure the tag contains an NDEF text record or exposes a serial number.",
          )
          ndef.removeEventListener("reading", handleReading)
          nfcHandlerRef.current = null
          ndefRef.current = null
          setScanning(false)
          return
        }
        setNfcUid(credential)
        ndef.removeEventListener("reading", handleReading)
        nfcHandlerRef.current = null
        ndefRef.current = null
        setScanning(false)
        handleNfcLookup(credential)
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
      if (!eventId) { toast.error("No event selected"); return }
      const attendeeResp = await AttendeesService.readAttendees({
        query: { person_id: student.person_id ?? "", limit: 1 },
        throwOnError: false,
      })
      const attendeeId = attendeeResp.data?.data?.[0]?.id
      if (!attendeeId) { toast.error("No attendee record found for this student"); return }
      const activeSession = await getActiveAttendanceSession(eventId)
      if (!activeSession) { toast.error("No active attendance session"); return }

      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      if (navigator.onLine) {
        const result = await AttendanceService.scanAttendanceManual({
          body: { event_id: eventId, attendee_id: attendeeId, scan_method: "manual" },
          headers: { "X-Attendance-Session-ID": activeSession.id },
          throwOnError: false,
        })
        if (!result.error) {
          setLastResult({
            type: "success",
            message: result.data?.message ?? "Attendance recorded",
            name: student.person_name ?? result.data?.person_name ?? undefined,
            studentNumber: student.student_number ?? result.data?.student_number ?? undefined,
            timestamp: nowStr,
          })
          toast.success(result.data?.message ?? "Attendance recorded")
          return
        }
        const statusCode = (result as any).status
        const detail = (result as any).data?.detail ?? "Scan failed"
        if (statusCode && statusCode < 500) {
          setLastResult({ type: statusCode === 409 ? "duplicate" : "error", message: detail, name: student.person_name ?? undefined, studentNumber: student.student_number ?? undefined, timestamp: nowStr })
          toast.error(detail)
          return
        }
      }

      await enqueueScan({
        event_id: eventId,
        attendance_session_id: activeSession.id,
        attendee_id: attendeeId,
        credential_value: "",
        scan_method: "manual",
      })
      setLastResult({
        type: "success",
        message: navigator.onLine ? "Saved for automatic retry" : "Saved offline",
        name: student.person_name ?? undefined,
        studentNumber: student.student_number ?? undefined,
        timestamp: nowStr,
      })
      toast.success(navigator.onLine ? "Saved for automatic retry" : "Saved offline")
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance Scanner
          </h1>
          <p className="text-muted-foreground">
            {currentEvent
              ? `Recording for "${currentEvent.event_name}" (Auto Time-In / Time-Out)`
              : "Select an event to start recording attendance"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={eventId || ""}
            onValueChange={(value) =>
              navigate({
                to: "/scanner",
                search: { event_id: value || undefined },
              })
            }
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select event..." />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.event_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {lastResult ? (
        <Card
          className={`border-2 transition-all ${
            lastResult.type === "success"
              ? "border-green-500 bg-green-50/50 dark:bg-green-950/20"
              : lastResult.type === "duplicate"
                ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
                : "border-destructive bg-destructive/10"
          }`}
        >
          <CardContent className="pt-6 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    lastResult.type === "success"
                      ? "default"
                      : lastResult.type === "duplicate"
                        ? "outline"
                        : "destructive"
                  }
                >
                  {lastResult.type === "success"
                    ? "Recorded"
                    : lastResult.type === "duplicate"
                      ? "Duplicate"
                      : "Notice"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {lastResult.timestamp}
                </span>
              </div>
              <div className="text-lg font-semibold tracking-tight">
                {lastResult.name ?? lastResult.message}
              </div>
              {lastResult.name && (
                <div className="text-sm text-muted-foreground">
                  {lastResult.studentNumber && (
                    <span className="font-mono mr-2">
                      {lastResult.studentNumber}
                    </span>
                  )}
                  <span>• {lastResult.message}</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastResult(null)}
              className="text-xs"
            >
              Ready for Next
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-dashed text-sm text-muted-foreground bg-muted/30">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>Ready for attendee scan or manual lookup</span>
        </div>
      )}

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
            {scanning && (
              <Button variant="outline" onClick={stopNfcScanning}>
                <XCircle className="mr-1 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            NFC Diagnostic
            <Badge variant="outline" className="ml-auto font-normal">
              Temporary
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!nfcDiagnostic ? (
            <p className="text-muted-foreground">
              No NFC reading captured yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Reading captured at {nfcDiagnostic.timestamp}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Serial Number
                  </div>
                  <div className="font-mono break-all">
                    {nfcDiagnostic.serialNumber ?? "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Records</div>
                  <div className="font-mono">{nfcDiagnostic.recordCount}</div>
                </div>
              </div>

              {nfcDiagnostic.records.length === 0 ? (
                <p className="text-muted-foreground">
                  No NDEF records were present on this reading.
                </p>
              ) : (
                nfcDiagnostic.records.map((rec, idx) => (
                  <div key={idx} className="space-y-1">
                    <Separator />
                    <div className="font-medium">Record #{idx + 1}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Type
                        </div>
                        <div className="font-mono break-all">
                          {rec.recordType || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Media Type
                        </div>
                        <div className="font-mono break-all">
                          {rec.mediaType ?? "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">ID</div>
                        <div className="font-mono break-all">
                          {rec.id ?? "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Data Length
                        </div>
                        <div className="font-mono">
                          {rec.dataLength ?? "N/A"}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Decoded Data
                      </div>
                      <div className="font-mono break-all whitespace-pre-wrap">
                        {rec.decodedData ?? "N/A"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
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
                  <div className="font-medium">
                    {s.person_name ?? s.student_number}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {s.student_number}
                  </div>
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
        activeSession={syncStatus.activeSession}
      />
    </div>
  )
}

export default Scanner
