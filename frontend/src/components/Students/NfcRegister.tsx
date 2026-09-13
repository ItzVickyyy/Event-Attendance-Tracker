import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Loader2, Search, UserCheck, Wifi, WifiOff } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { StudentPublic } from "@/client"
import { StudentsService } from "@/client"
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
  const [foundStudent, setFoundStudent] = useState<StudentPublic | null>(null)

  const checkNfcSupport = useCallback(() => {
    const supported = "NDEFReader" in window
    setNfcSupported(supported)
    return supported
  }, [])

  const scanNfc = useCallback(async () => {
    if (!checkNfcSupport()) {
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
        const uid = event.serialNumber
        if (uid) {
          setNfcUid(uid.toUpperCase())
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
        }
      }

      ndef.addEventListener("reading", handleReading)

      setTimeout(() => {
        if (scanning) {
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
  }, [checkNfcSupport, scanning])

  const lookupMutation = useMutation({
    mutationFn: (uid: string) =>
      StudentsService.lookupByNfc({
        path: { nfc_uid: uid },
        throwOnError: false,
      }),
    onSuccess: (result) => {
      if (result.data) {
        setFoundStudent(result.data)
        toast.success(
          `Found: ${result.data.last_name}, ${result.data.first_name}`,
        )
      }
    },
    onError: () => {
      setFoundStudent(null)
      toast.error("No student found with this NFC UID")
    },
  })

  const registerMutation = useMutation({
    mutationFn: ({ studentId, uid }: { studentId: string; uid: string }) =>
      StudentsService.updateStudent({
        path: { student_id: studentId },
        body: { nfc_uid: uid },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("NFC UID registered successfully")
      setNfcUid("")
      setFoundStudent(null)
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to register NFC UID")
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
    registerMutation.mutate({ studentId: student.id, uid: nfcUid })
  }

  const handleScanAndRegister = async () => {
    if (!student) return
    if (!checkNfcSupport()) return

    try {
      setScanning(true)
      const ndef = new (window as any).NDEFReader()
      await ndef.scan()
      setPermissionGranted(true)

      const handleReading = async (event: any) => {
        const uid = event.serialNumber
        if (uid) {
          ndef.removeEventListener("reading", handleReading)
          setScanning(false)
          await registerMutation.mutateAsync({
            studentId: student.id,
            uid: uid.toUpperCase(),
          })
        }
      }

      ndef.addEventListener("reading", handleReading)

      setTimeout(() => {
        if (scanning) {
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

  if (!student && !nfcSupported && !checkNfcSupport()) {
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
              ? `Register an NFC tag for ${student.last_name}, ${student.first_name} (${student.student_number})`
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

              {foundStudent && (
                <div className="border rounded-lg p-4 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {foundStudent.last_name}, {foundStudent.first_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {foundStudent.student_number} • {foundStudent.year}
                        {foundStudent.section}
                      </p>
                    </div>
                    <UserCheck className="h-6 w-6 text-green-500" />
                  </div>
                  {foundStudent.nfc_uid && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Already registered with UID:{" "}
                      <code className="font-mono">{foundStudent.nfc_uid}</code>
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
