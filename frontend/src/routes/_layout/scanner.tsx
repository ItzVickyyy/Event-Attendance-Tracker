import { Wifi, Loader2, Search, CheckCircle, Camera, CameraOff } from "lucide-react"
import { useState, useCallback, useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { toast } from "sonner"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { AttendanceService, StudentsService, UsersService, AttendeeCredentialsService } from "@/client"
import type { StudentPublic, ScanMethod } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Html5Qrcode } from "html5-qrcode"

type ScanAction = "time_in" | "time_out"

export const Route = createFileRoute("/_layout/scanner")({
  component: Scanner,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe().catch(() => ({ data: null }))
    if (!user || (!user.is_superuser && user.role !== "admin" && user.role !== "super_admin" && user.role !== "developer" && !user.can_scan)) {
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

function Scanner() {
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false })
  const eventId = search?.event_id as string | undefined

  const [scanning, setScanning] = useState(false)
  const [nfcUid, setNfcUid] = useState("")
  const [nfcSupported, setNfcSupported] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [foundStudent, setFoundStudent] = useState<StudentPublic | null>(null)
  const [scanAction, setScanAction] = useState<ScanAction>("time_in")
  const [lastScan, setLastScan] = useState<{
    student: StudentPublic
    action: ScanAction
    time: Date
    status: string
  } | null>(null)
  const [manualSearch, setManualSearch] = useState("")
  const ndefReaderRef = useRef<any>(null)
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null)
  const [qrScanning, setQrScanning] = useState(false)
  const [qrSupported, setQrSupported] = useState(false)
  const [qrPermissionGranted, setQrPermissionGranted] = useState(false)
  const [lastScannedCredential, setLastScannedCredential] = useState<string | null>(null)
  const [lastScanTime, setLastScanTime] = useState<number>(0)

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
      ndefReaderRef.current = ndef
      await ndef.scan()
      setPermissionGranted(true)

      const handleReading = (event: any) => {
        const uid = event.serialNumber
        if (uid) {
          const formattedUid = uid.toUpperCase()
          setNfcUid(formattedUid)
          ndef.removeEventListener("reading", handleReading)
          ndefReaderRef.current = null
          setScanning(false)
          handleNfcLookup(formattedUid)
        }
      }

      ndef.addEventListener("reading", handleReading)

      setTimeout(() => {
        if (scanning && ndefReaderRef.current) {
          ndefReaderRef.current.removeEventListener("reading", handleReading)
          ndefReaderRef.current = null
          setScanning(false)
          toast.error("Scan timeout. Please try again.")
        }
      }, 30000)
    } catch (error) {
      setScanning(false)
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          toast.error("NFC permission denied. Please allow NFC access in browser settings.")
          setPermissionGranted(false)
        } else {
          toast.error(`NFC error: ${error.message}`)
        }
      }
    }
  }, [checkNfcSupport, scanning])

  const stopScanning = useCallback(() => {
    if (ndefReaderRef.current) {
      ndefReaderRef.current = null
      setScanning(false)
    }
  }, [])

  const checkQrSupport = useCallback(() => {
    const supported = "BarcodeDetector" in window || typeof Html5Qrcode !== "undefined"
    setQrSupported(supported)
    return supported
  }, [])

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
        async (decodedText, decodedResult) => {
          // Prevent duplicate scans within 2 seconds
          const now = Date.now()
          if (decodedText === lastScannedCredential && now - lastScanTime < 2000) {
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
        (errorMessage) => {
          // Ignore scan errors (no QR code in frame)
        }
      )
      setQrPermissionGranted(true)
    } catch (error) {
      setQrScanning(false)
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.message.includes("permission")) {
          toast.error("Camera permission denied. Please allow camera access in browser settings.")
          setQrPermissionGranted(false)
        } else {
          toast.error(`QR scan error: ${error.message}`)
        }
      }
    }
  }, [checkQrSupport, lastScannedCredential, lastScanTime])

  const stopQrScanning = useCallback(() => {
    if (html5QrcodeRef.current) {
      html5QrcodeRef.current.stop().catch(() => {})
      html5QrcodeRef.current = null
      setQrScanning(false)
    }
  }, [])

  const handleQrLookup = useCallback((credentialValue: string) => {
    if (!eventId) {
      toast.error("Please select an event first")
      return
    }
    submitAttendance(credentialValue, "qr")
  }, [eventId])

  const lookupMutation = useMutation({
    mutationFn: async (uid: string) => {
      const result = await AttendeeCredentialsService.credentialsLookupCredential({
        path: { credential_value: uid },
        throwOnError: false,
      })
      return { uid, credential: result.data }
    },
    onSuccess: (result) => {
      if (result.credential) {
        if (!eventId) {
          toast.error("Please select an event first")
          return
        }
        submitAttendance(result.uid, "nfc")
      }
    },
    onError: () => {
      setFoundStudent(null)
      toast.error("No student found with this NFC UID")
    },
  })

  const manualLookupMutation = useMutation({
    mutationFn: (query: string) =>
      StudentsService.readStudents({
        query: { skip: 0, limit: 10, search: query },
        throwOnError: false,
      }),
    onSuccess: (result) => {
      if (result.data?.data && result.data.data.length === 1) {
        setFoundStudent(result.data.data[0])
        if (!eventId) {
          toast.error("Please select an event first")
          return
        }
        submitAttendance(result.data.data[0], "manual")
      } else if (result.data?.data && result.data.data.length > 1) {
        toast.info("Multiple students found. Please be more specific.")
        setFoundStudent(null)
      } else {
        setFoundStudent(null)
        toast.error("No student found")
      }
    },
    onError: () => {
      setFoundStudent(null)
      toast.error("Search failed")
    },
  })

  const scanAttendanceMutation = useMutation({
    mutationFn: (data: { event_id: string; credential_value: string; scan_method: ScanMethod }) =>
      AttendanceService.scanAttendance({
        body: data,
        throwOnError: true,
      }),
    onSuccess: (result) => {
      const action = scanAction
      const message = result.data?.message || "Scan recorded"
      setLastScan({
        student: foundStudent!,
        action,
        time: new Date(),
        status: message,
      })
      setNfcUid("")
      setFoundStudent(null)
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      toast.success(message)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to record attendance")
    },
  })

  const submitAttendance = async (studentOrCredential: StudentPublic | string, scanMethod: "nfc" | "manual" | "qr") => {
    if (!eventId) return
    const credentialValue = typeof studentOrCredential === "string" ? studentOrCredential : (studentOrCredential.nfc_uid || "")
    await scanAttendanceMutation.mutateAsync({
      event_id: eventId,
      credential_value: credentialValue,
      scan_method: scanMethod,
    })
  }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualSearch.trim()) {
      manualLookupMutation.mutate(manualSearch.trim())
    }
  }

  const handleNfcLookup = (uid: string) => {
    lookupMutation.mutate(uid)
  }

  

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Scanner</h1>
          <p className="text-muted-foreground">Scan student IDs or search manually</p>
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
              Web NFC is not supported in this browser. Use QR scanning or manual search instead.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="8F:49:5B:74"
              value={nfcUid}
              onChange={(e) => setNfcUid(e.target.value.toUpperCase())}
              disabled={scanning || !nfcSupported}
              className="flex-1 font-mono"
            />
            <LoadingButton
              loading={scanning}
              onClick={scanNfc}
              disabled={scanning || !nfcSupported || !permissionGranted}
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
            {qrScanning ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-5 w-5" />}
            QR Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!qrSupported ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <CameraOff className="h-6 w-6" />
              <p className="text-sm">QR scanning is not supported in this browser or device.</p>
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
                <p className="text-sm text-muted-foreground">Camera permission is requested when scanning starts.</p>
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
        </CardContent>
      </Card>

      {lastScan && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-green-700">{lastScan.status}</p>
                <p className="text-sm text-green-600">
                  {lastScan.student.last_name}, {lastScan.student.first_name} •{" "}
                  {lastScan.student.student_number}
                </p>
                <p className="text-sm text-green-600">
                  {lastScan.action === "time_in" ? "Time-In" : "Time-Out"} at{" "}
                  {lastScan.time.toLocaleTimeString()}
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Scanner