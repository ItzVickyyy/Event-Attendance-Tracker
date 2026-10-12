import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, KeyRound, Loader2, Plus, Trash2, Wifi } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  type AttendeeCredentialPublic,
  AttendeeCredentialsService,
  AttendeesService,
  type StudentPublic,
  StudentsService,
} from "@/client"
import { Badge } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"

interface StudentCredentialsDialogProps {
  student: StudentPublic
}

async function resolveAttendeeId(student: StudentPublic): Promise<string> {
  if (student.attendee_id) return student.attendee_id

  // Some student-table views pass a reduced row without person_id. Resolve the
  // canonical record by student ID before looking up its attendee.
  let personId = student.person_id
  if (!personId && student.id) {
    const detail = await StudentsService.readStudent({
      path: { student_id: student.id },
      throwOnError: true,
    })
    personId = detail.data.person_id
  }

  if (!personId) {
    throw new Error(
      "Could not resolve this student's person ID from the saved student record. Refresh the page and try again.",
    )
  }

  const result = await AttendeesService.readAttendees({
    query: { person_id: personId, limit: 1 },
    throwOnError: true,
  })
  const attendees = (
    result as unknown as { data: { data: { id: string; person_id: string }[] } }
  ).data.data
  const existing = attendees.find((attendee) => attendee.person_id === personId)

  if (!existing) {
    throw new Error(
      "This student does not have an attendee record. Re-save or re-import the student to provision the QR credential, then try again.",
    )
  }

  return existing.id
}

export function StudentCredentialsDialog({
  student,
}: StudentCredentialsDialogProps) {
  const [open, setOpen] = useState(false)
  const [newCredValue, setNewCredValue] = useState("")
  const [scanningNfc, setScanningNfc] = useState(false)
  const queryClient = useQueryClient()

  // 1. Resolve Attendee ID for Student
  const {
    data: attendeeId,
    isLoading: isLoadingAttendee,
    error: attendeeError,
  } = useQuery({
    queryKey: ["attendeeIdForPerson", student.person_id],
    queryFn: () => resolveAttendeeId(student),
    enabled: open,
  })

  // 2. Fetch Credentials for this Attendee
  const {
    data: credentialsResponse,
    isLoading: isLoadingCreds,
    refetch,
  } = useQuery({
    queryKey: ["attendeeCredentials", attendeeId],
    queryFn: async () => {
      if (!attendeeId) return { data: [], count: 0 }
      const res =
        await AttendeeCredentialsService.credentialsReadAttendeeCredentials({
          query: { attendee_id: attendeeId, limit: 100 },
        })
      return res.data
    },
    enabled: !!attendeeId && open,
  })

  const credentials: AttendeeCredentialPublic[] =
    credentialsResponse?.data ?? []

  // Mutation to create a credential
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!attendeeId) throw new Error("Attendee not resolved")
      return await AttendeeCredentialsService.credentialsCreateAttendeeCredential(
        {
          body: {
            attendee_id: attendeeId,
            credential_type: "nfc",
            credential_value: newCredValue.trim().toUpperCase(),
            is_active: true,
          },
        },
      )
    },
    onSuccess: () => {
      toast.success("Credential added successfully")
      setNewCredValue("")
      refetch()
      queryClient.invalidateQueries({ queryKey: ["attendeeCredentials"] })
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add credential")
    },
  })

  // Mutation to delete a credential
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await AttendeeCredentialsService.credentialsDeleteAttendeeCredential(
        {
          path: { credential_id: id },
        },
      )
    },
    onSuccess: () => {
      toast.success("Credential deleted")
      refetch()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete credential")
    },
  })

  const handleScanNfc = async () => {
    if (!("NDEFReader" in window)) {
      toast.error("Web NFC is not supported here. Use Chrome on Android.")
      return
    }

    let reader: any
    let timeoutId: number | undefined
    setScanningNfc(true)
    try {
      reader = new (window as any).NDEFReader()
      await reader.scan()
      const captured = await new Promise<string>((resolve, reject) => {
        const cleanup = () => {
          reader.removeEventListener("reading", onReading)
          if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        }
        const onReading = (event: any) => {
          // Empty NDEF tags can still expose the card identity as serialNumber.
          const serial =
            typeof event.serialNumber === "string"
              ? event.serialNumber.trim()
              : ""
          let textRecord = ""
          for (const record of event.message?.records ?? []) {
            if (
              record.recordType !== "text" ||
              !(record.data instanceof DataView)
            )
              continue
            const data = record.data
            if (!data.byteLength) continue
            const status = data.getUint8(0)
            const languageLength = status & 0x3f
            const start = 1 + languageLength
            if (start < data.byteLength) {
              textRecord = new TextDecoder(
                (status & 0x80) !== 0 ? "utf-16" : "utf-8",
              )
                .decode(
                  new Uint8Array(
                    data.buffer,
                    data.byteOffset + start,
                    data.byteLength - start,
                  ),
                )
                .trim()
              if (textRecord) break
            }
          }
          const value = textRecord || serial
          if (!value) return
          cleanup()
          resolve(value.toUpperCase())
        }
        reader.addEventListener("reading", onReading)
        timeoutId = window.setTimeout(() => {
          cleanup()
          reject(
            new Error(
              "No NFC identifier was received within 30 seconds. Try again or enter the UID manually.",
            ),
          )
        }, 30000)
      })
      setNewCredValue(captured)
      toast.success(
        "Card identifier captured. Confirm the student and click Add to save it.",
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to read NFC card"
      toast.error(message)
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      setScanningNfc(false)
    }
  }

  const handleAddCredential = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCredValue.trim()) {
      toast.error("Please enter a credential value")
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Manage Credentials">
          <KeyRound className="h-4 w-4 mr-1 text-primary" />
          Credentials
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Manage Credentials
          </DialogTitle>
          <DialogDescription>
            View or register the NFC card UID for student{" "}
            <span className="font-semibold text-foreground">
              {student.student_number}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {isLoadingAttendee || (attendeeId && isLoadingCreds) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : attendeeError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {attendeeError instanceof Error
              ? attendeeError.message
              : "Unable to resolve this student’s attendee record."}
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-2">
            {/* List Existing Credentials */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Assigned NFC Cards (
                {
                  credentials.filter((cred) => cred.credential_type === "nfc")
                    .length
                }
                )
              </h4>
              {credentials.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No Card UID registered yet. Scan the student card below to register it.
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {credentials
                    .filter((cred) => cred.credential_type === "nfc")
                    .map((cred) => (
                      <div
                        key={cred.id}
                        className="flex items-center justify-between p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-muted p-2">
                            <Wifi className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">
                                {cred.credential_value}
                              </span>
                              <Badge variant="outline" className="text-xs"><CheckCircle2 className="mr-1 h-3 w-3" />Registered · {cred.credential_value}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Added:{" "}
                              {new Date(
                                cred.created_at || Date.now(),
                              ).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">Always active</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(cred.id)}
                            disabled={deleteMutation.isPending}
                            title="Delete credential"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* One NFC Card UID per student. */}
            {!credentials.some((cred) => cred.credential_type === "nfc") && (
            <form
              onSubmit={handleAddCredential}
              className="space-y-4 rounded-lg border bg-muted/30 p-4"
            >
              <h4 className="text-sm font-semibold">Register Card UID</h4>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cred-val" className="text-xs">
                    Value / UID
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="cred-val"
                      placeholder="Scan card or enter UID"
                      value={newCredValue}
                      onChange={(e) => setNewCredValue(e.target.value)}
                      className="min-w-0 flex-1 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleScanNfc()}
                      disabled={scanningNfc || createMutation.isPending}
                      className="shrink-0"
                    >
                      {scanningNfc ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                      {scanningNfc ? "Tap card..." : "Scan card"}
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        createMutation.isPending || !newCredValue.trim()
                      }
                      className="shrink-0"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Register Card UID
                    </Button>
                  </div>
                </div>
              </div>
            </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
export default StudentCredentialsDialog
