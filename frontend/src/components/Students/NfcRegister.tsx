import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Loader2, Search, UserCheck, Wifi, WifiOff } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { AttendeeCredentialCreate, AttendeeCredentialPublic, StudentPublic } from "@/client"
import { AttendeeCredentialsService } from "@/client"
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

export function NfcRegister({ student }: NfcRegisterProps) {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [nfcUid, setNfcUid] = useState("")
  const [nfcSupported, setNfcSupported] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [foundCredential, setFoundCredential] = useState<AttendeeCredentialPublic | null>(null)
  const scanningRef = useRef(false)

  useEffect(() => {
    setNfcSupported("NDEFReader" in window)
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
        const uid = event.message
        if (uid) {
          setNfcUid(uid.toUpperCase())
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
        }
      }

      ndef.addEventListener("reading", handleReading)

      setTimeout(() => {
        if (scanningRef.current) {
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
          toast.error("Scan timeout. Please try again.")
        }
      }, 30000)
    } catch (error) {
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
      toast.success(
        `Found credential for attendee: ${data.attendee_id}`,
      )
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

  const handleRegister = () => {
    if (!student) return
    if (!foundCredential) return
    registerMutation.mutate({
      attendee_id: foundCredential.attendee_id,
      credential_value: nfcUid,
      credential_type: "nfc",
    })
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
        const uid = event.message
        if (uid) {
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
          const response = await AttendeeCredentialsService.credentialsLookupCredential({
            path: { credential_value: uid.toUpperCase() },
            throwOnError: true,
          })
          const credential = (response as any).data as AttendeeCredentialPublic
          setFoundCredential(credential)
          await registerMutation.mutateAsync({
            attendee_id: credential.attendee_id,
            credential_value: uid.toUpperCase(),
            credential_type: "nfc",
          })
        }
      }

      ndef.addEventListener("reading", handleReading)

      setTimeout(() => {
        if (scanningRef.current) {
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
          toast.error("Scan timeout. Please try again.")
        }
      }, 30000)
    } catch (error) {
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
                <Button
                  variant="outline"
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
