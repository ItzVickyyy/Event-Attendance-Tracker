import { Wifi, WifiOff, UserCheck, Loader2, Search, X, CheckCircle } from "lucide-react"
import { useState, useCallback, useEffect, useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { AttendanceService, StudentsService, UsersService } from "@/client"
import type { StudentPublic, ScanMethod } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

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
  const { user } = useAuth()
  const router = useRouter()
  const search = router.location.search
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

  useEffect(() => {
    checkNfcSupport()
    return () => stopScanning()
  }, [checkNfcSupport, stopScanning])

  const lookupMutation = useMutation({
    mutationFn: (uid: string) =>
      StudentsService.lookupByNfc({
        path: { nfc_uid: uid },
        throwOnError: false,
      }),
    onSuccess: (result) => {
      if (result.data) {
        setFoundStudent(result.data)
        if (!eventId) {
          toast.error("Please select an event first")
          return
        }
        submitAttendance(result.data, "nfc")
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

  const submitAttendance = async (student: StudentPublic, scanMethod: "nfc" | "manual") => {
    if (!eventId) return
    const credentialValue = student.nfc_uid || ""
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

      {!nfcSupported ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 text-destructive">
              <WifiOff className="h-8 w-8" />
              <div>
                <p className="font-medium">Web NFC Not Supported</p>
                <p className="text-sm text-muted-foreground">
                  This browser does not support Web NFC. Please use Chrome on Android for NFC scanning.
                  Use the manual search below as a fallback.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
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
            <div className="flex items-center gap-2">
              <Input
                placeholder="8F:49:5B:74"
                value={nfcUid}
                onChange={(e) => setNfcUid(e.target.value.toUpperCase())}
                disabled={scanning}
                className="flex-1 font-mono"
              />
              <LoadingButton
                loading={scanning}
                onClick={scanNfc}
                disabled={scanning || !permissionGranted}
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

            {foundStudent && (
              <div className="border rounded-lg p-4 bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">
                      {foundStudent.last_name}, {foundStudent.first_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {foundStudent.student_number} • {foundStudent.year}{foundStudent.section}
                    </p>
                  </div>
                  <UserCheck className="h-8 w-8 text-green-500" />
                </div>
                {foundStudent.nfc_uid && (
                  <p className="text-sm text-muted-foreground mt-2">
                    NFC UID: <code className="font-mono">{foundStudent.nfc_uid}</code>
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <LoadingButton
                    loading={createAttendanceMutation.isPending}
                    onClick={() => submitAttendance(foundStudent!.id)}
                    disabled={!eventId}
                    className="flex-1"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm {scanAction === "time_in" ? "Time-In" : "Time-Out"}
                  </LoadingButton>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFoundStudent(null)
                      setNfcUid("")
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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