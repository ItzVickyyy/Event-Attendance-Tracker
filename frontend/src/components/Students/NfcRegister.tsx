import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Loader2, Search, UserCheck, Wifi, WifiOff } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type {
  AttendeeCredentialCreate,
  AttendeeCredentialPublic,
  StudentPublic,
} from "@/client"
import { AttendeeCredentialsService, AttendeesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"

interface NfcRegisterProps {
  student?: StudentPublic
}

async function resolveAttendeeId(personId: string): Promise<string> {
  const result = await AttendeesService.readAttendees({
    query: { limit: 10000 },
    throwOnError: true,
  })
  const attendees = (
    result as unknown as { data: { data: { id: string; person_id: string }[] } }
  ).data.data
  const existing = attendees.find((a) => a.person_id === personId)
  if (existing) return existing.id
  const created = await AttendeesService.createAttendee({
    body: { person_id: personId, attendee_type: "student" },
    throwOnError: true,
  })
  return (created as unknown as { data: { id: string } }).data.id
}

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

export function NfcRegister({ student }: NfcRegisterProps) {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [nfcUid, setNfcUid] = useState("")
  const [nfcSupported, setNfcSupported] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [foundCredential, setFoundCredential] =
    useState<AttendeeCredentialPublic | null>(null)
  const ndefRef = useRef<any>(null)
  const handlerRef = useRef<((event: any) => void) | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setNfcSupported("NDEFReader" in window)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      if (ndefRef.current && handlerRef.current) {
        ndefRef.current.removeEventListener("reading", handlerRef.current)
      }
    }
  }, [])

  const scanNfc = useCallback(async () => {
    if (!("NDEFReader" in window)) {
      toast.error(
        "Web NFC is not supported in this browser. Use Chrome on Android.",
      )
      return
    }

    try {
      setScanning(true)
      const ndef = new (window as any).NDEFReader()
      await ndef.scan()
      setPermissionGranted(true)

      const handleReading = (event: any) => {
        const uid = extractNfcCredential(event)
        if (!uid) return
        setNfcUid(uid.toUpperCase())
        ndef.removeEventListener("reading", handleReading)
        handlerRef.current = null
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setScanning(false)
      }

      ndef.addEventListener("reading", handleReading)
      ndefRef.current = ndef
      handlerRef.current = handleReading

      timeoutRef.current = window.setTimeout(() => {
        ndef.removeEventListener("reading", handleReading)
        handlerRef.current = null
        timeoutRef.current = null
        setScanning(false)
        toast.error("Scan timeout. Please try again.")
      }, 30000)
    } catch (error) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setScanning(false)
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
  }, [])

  const lookupMutation = useMutation({
    mutationFn: (uid: string) =>
      AttendeeCredentialsService.credentialsLookupCredential({
        path: { credential_value: uid },
        throwOnError: false,
      }),
    onSuccess: (result) => {
      const data = (result as any).data as AttendeeCredentialPublic
      setFoundCredential(data)
      toast.success(`Found credential for attendee: ${data.attendee_id}`)
    },
    onError: () => {
      setFoundCredential(null)
      toast.error("No credential found with this NFC UID")
    },
  })

  const registerMutation = useMutation({
    mutationFn: (body: AttendeeCredentialCreate) =>
      AttendeeCredentialsService.credentialsCreateAttendeeCredential({
        body,
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("NFC credential registered successfully")
      setNfcUid("")
      setFoundCredential(null)
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to register NFC credential")
    },
  })

  const handleManualLookup = async (uid: string) => {
    if (!uid.trim()) {
      toast.error("Please enter an NFC UID")
      return
    }
    await lookupMutation.mutateAsync(uid.trim().toUpperCase())
  }

  const handleRegister = async () => {
    if (!student) {
      toast.error("No student selected")
      return
    }
    const uid = nfcUid.trim().toUpperCase()
    if (!uid) {
      toast.error("Please enter or scan an NFC UID first")
      return
    }
    try {
      const attendeeId = await resolveAttendeeId(student.person_id)
      await registerMutation.mutateAsync({
        attendee_id: attendeeId,
        credential_value: uid,
        credential_type: "nfc",
      })
    } catch (e: any) {
      toast.error(e?.message || "Failed to resolve attendee")
    }
  }

  const handleScanAndRegister = async () => {
    if (!student) return
    if (!("NDEFReader" in window)) return

    try {
      setScanning(true)
      const ndef = new (window as any).NDEFReader()
      await ndef.scan()
      setPermissionGranted(true)

      const handleReading = async (event: any) => {
        const raw = extractNfcCredential(event)
        if (!raw) return
        const uid = raw.toUpperCase()
        ndef.removeEventListener("reading", handleReading)
        handlerRef.current = null
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setScanning(false)
        setNfcUid(uid)
        try {
          const attendeeId = await resolveAttendeeId(student.person_id)
          await registerMutation.mutateAsync({
            attendee_id: attendeeId,
            credential_value: uid,
            credential_type: "nfc",
          })
        } catch (e: any) {
          toast.error(e?.message || "Failed to register NFC credential")
        }
      }

      ndef.addEventListener("reading", handleReading)
      ndefRef.current = ndef
      handlerRef.current = handleReading

      timeoutRef.current = window.setTimeout(() => {
        ndef.removeEventListener("reading", handleReading)
        handlerRef.current = null
        timeoutRef.current = null
        setScanning(false)
        toast.error("Scan timeout. Please try again.")
      }, 30000)
    } catch (error) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setScanning(false)
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
  }

  if (!student && !nfcSupported) {
    return (
      <Button
        variant="outline"
        size="icon"
        disabled
        title="Web NFC not supported"
      >
        <WifiOff className="h-4 w-4 text-muted-foreground" />
      </Button>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={student ? "outline" : "default"}
          size="icon"
          className={student ? undefined : "bg-primary text-primary-foreground"}
          disabled={scanning}
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {student ? "Register NFC ID" : "Scan NFC Tag"}
          </DialogTitle>
          <DialogDescription>
            {student
              ? `Register an NFC tag for ${student.student_number}`
              : "Scan a school ID to read its NFC UID"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!nfcSupported ? (
            <div className="text-center py-4 text-destructive">
              <WifiOff className="mx-auto h-12 w-12 mb-2" />
              <p>Web NFC is not supported in this browser.</p>
              <p className="text-sm text-muted-foreground">
                Please use Chrome on Android for NFC scanning.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="8F:49:5B:74"
                  value={nfcUid}
                  onChange={(e) => setNfcUid(e.target.value.toUpperCase())}
                  disabled={scanning}
                />
                <Button variant="outline" onClick={scanNfc} disabled={scanning}>
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
                </Button>
              </div>

              {foundCredential && (
                <div className="border rounded-lg p-4 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        Attendee: {foundCredential.attendee_id}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Credential: {foundCredential.credential_value}
                      </p>
                    </div>
                    <UserCheck className="h-6 w-6 text-green-500" />
                  </div>
                  {foundCredential.is_active && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Already registered and active.
                    </p>
                  )}
                </div>
              )}

              {student && nfcUid && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleManualLookup(nfcUid)}
                    disabled={lookupMutation.isPending}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Lookup UID
                  </Button>
                  <LoadingButton
                    loading={registerMutation.isPending}
                    onClick={handleRegister}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    Register to This Student
                  </LoadingButton>
                </div>
              )}

              {!student && (
                <Button
                  variant="default"
                  onClick={handleScanAndRegister}
                  disabled={scanning}
                  className="w-full"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scan and Register...
                    </>
                  ) : (
                    "Scan and Register to Selected Student"
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default NfcRegister
