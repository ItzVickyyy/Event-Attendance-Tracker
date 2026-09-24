import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Loader2, Plus, QrCode, Trash2, Wifi } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  type AttendeeCredentialPublic,
  AttendeeCredentialsService,
  AttendeesService,
  type CredentialType,
  type StudentPublic,
} from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StudentCredentialsDialogProps {
  student: StudentPublic
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

export function StudentCredentialsDialog({
  student,
}: StudentCredentialsDialogProps) {
  const [open, setOpen] = useState(false)
  const [newCredType, setNewCredType] = useState<CredentialType>("nfc")
  const [newCredValue, setNewCredValue] = useState("")
  const queryClient = useQueryClient()

  // 1. Resolve Attendee ID for Student
  const { data: attendeeId, isLoading: isLoadingAttendee } = useQuery({
    queryKey: ["attendeeIdForPerson", student.person_id],
    queryFn: () => resolveAttendeeId(student.person_id),
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
            credential_type: newCredType,
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

  // Mutation to toggle active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await AttendeeCredentialsService.credentialsUpdateAttendeeCredential(
        {
          path: { credential_id: id },
          body: { is_active: isActive },
        },
      )
    },
    onSuccess: () => {
      toast.success("Credential status updated")
      refetch()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update credential")
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
            View, activate/deactivate, or add credentials (NFC UID, QR Code) for
            student{" "}
            <span className="font-semibold text-foreground">
              {student.student_number}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {isLoadingAttendee || isLoadingCreds ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-2">
            {/* List Existing Credentials */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Assigned Credentials ({credentials.length})
              </h4>
              {credentials.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No credentials assigned yet. Add one below.
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {credentials.map((cred) => (
                    <div
                      key={cred.id}
                      className="flex items-center justify-between p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-muted p-2">
                          {cred.credential_type === "nfc" ? (
                            <Wifi className="h-4 w-4 text-blue-500" />
                          ) : (
                            <QrCode className="h-4 w-4 text-emerald-500" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                              {cred.credential_value}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs uppercase"
                            >
                              {cred.credential_type}
                            </Badge>
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
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`check-${cred.id}`}
                            checked={cred.is_active}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({
                                id: cred.id,
                                isActive: checked === true,
                              })
                            }
                            disabled={toggleMutation.isPending}
                          />
                          <Label
                            htmlFor={`check-${cred.id}`}
                            className="text-xs cursor-pointer text-muted-foreground"
                          >
                            {cred.is_active ? "Active" : "Inactive"}
                          </Label>
                        </div>
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

            {/* Add New Credential Form */}
            <form
              onSubmit={handleAddCredential}
              className="space-y-4 rounded-lg border bg-muted/30 p-4"
            >
              <h4 className="text-sm font-semibold">Add New Credential</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <Label htmlFor="cred-type" className="text-xs">
                    Type
                  </Label>
                  <Select
                    value={newCredType}
                    onValueChange={(val: CredentialType) => setNewCredType(val)}
                  >
                    <SelectTrigger id="cred-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nfc">NFC UID</SelectItem>
                      <SelectItem value="qr">QR Code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="cred-val" className="text-xs">
                    Value / UID
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="cred-val"
                      placeholder="e.g. 04A1B2C3D4"
                      value={newCredValue}
                      onChange={(e) => setNewCredValue(e.target.value)}
                      className="font-mono text-sm"
                    />
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
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
export default StudentCredentialsDialog
