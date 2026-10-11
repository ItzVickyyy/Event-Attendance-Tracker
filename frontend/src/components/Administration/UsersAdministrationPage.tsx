import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Settings2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { type UserPublic, type UserRole, UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import useAuth from "@/hooks/useAuth"

type OfficerPosition = { id: string; name: string; is_active: boolean }
type AcademicYear = { id: string; label: string; is_current: boolean }
type AcademicSection = {
  id: string
  program_code: string
  section_name: string
  year_level: string
  academic_year_id: string
}
type OfficerUser = UserPublic & {
  student_number?: string | null
  organization?: string | null
  position_id?: string | null
  academic_year_id?: string | null
  section_id?: string | null
}
type OfficerImportRow = {
  row_number: number
  student_number: string
  full_name: string
  position_name: string
  payload: Record<string, string> | null
  errors: string[]
}
type OfficerImportPreview = {
  total_rows: number
  valid_rows: number
  invalid_rows: number
  can_import: boolean
  rows: OfficerImportRow[]
}

const superAdminAccountRoles: UserRole[] = ["super_admin", "admin"]
const adminAccountRoles: UserRole[] = ["student"]
const api = "/api/v1"
const positionHierarchy = [
  "President",
  "Vice President",
  "Executive Secretary",
  "Recording Secretary",
  "Treasurer",
  "Auditor",
  "Business Manager",
  "Event Coordinator",
  "PIO for Publication",
  "PIO for Documentation",
  "Creative Designer",
  "BSCS 1st Year Representative",
  "BSCS 2nd Year Representative",
  "BSCS 3rd Year Representative",
  "BSCS 4th Year Representative",
  "BSIT 1st Year Representative",
  "BSIT 2nd Year Representative",
  "BSIT 3rd Year Representative",
  "BSIT 4th Year Representative",
  "SSC CSS Representative",
]
const comparePositions = (a: OfficerPosition, b: OfficerPosition) => {
  const ai = positionHierarchy.indexOf(a.name)
  const bi = positionHierarchy.indexOf(b.name)
  if (ai < 0 && bi < 0) return a.name.localeCompare(b.name)
  if (ai < 0) return 1
  if (bi < 0) return -1
  return ai - bi
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token")
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.detail ?? "The request could not be completed")
  }
  return body as T
}

export function UsersAdministrationPage() {
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const isSuperAdmin = Boolean(
    currentUser?.is_superuser || currentUser?.role === "super_admin",
  )
  const accountRoles = isSuperAdmin ? superAdminAccountRoles : adminAccountRoles
  const [q, setQ] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [managePositionsOpen, setManagePositionsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] =
    useState<OfficerImportPreview | null>(null)
  const [studentNumber, setStudentNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [middleInitial, setMiddleInitial] = useState("")
  const [lastName, setLastName] = useState("")
  const [extension, setExtension] = useState("")
  const [organization, setOrganization] = useState("CCS Student Council")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("student")
  const [academicYearId, setAcademicYearId] = useState("")
  const [sectionId, setSectionId] = useState("")
  const [positionId, setPositionId] = useState("")
  const [newPositionName, setNewPositionName] = useState("")

  const query = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => UsersService.readUsers({ query: { skip: 0, limit: 1000 } }),
  })
  const yearsQuery = useQuery({
    queryKey: ["officer-account-academic-years"],
    queryFn: () =>
      apiRequest<{ data: AcademicYear[] }>("/academic-registry/academic-years"),
    enabled: isSuperAdmin,
  })
  const sectionsQuery = useQuery({
    queryKey: ["officer-account-sections", academicYearId],
    queryFn: () =>
      apiRequest<{ data: AcademicSection[] }>(
        `/academic-registry/sections?academic_year_id=${encodeURIComponent(academicYearId)}`,
      ),
    enabled: isSuperAdmin && Boolean(academicYearId),
  })
  const positionsQuery = useQuery({
    queryKey: ["officer-positions"],
    queryFn: () =>
      apiRequest<{ data: OfficerPosition[] }>("/users/officer-positions"),
    enabled: true,
  })

  useEffect(() => {
    if (!academicYearId && yearsQuery.data?.data.length) {
      const preferred =
        yearsQuery.data.data.find((year) => year.is_current) ??
        yearsQuery.data.data[0]
      setAcademicYearId(preferred.id)
    }
  }, [academicYearId, yearsQuery.data])
  useEffect(() => {
    if (!positionId && positionsQuery.data?.data.length) {
      const preferred = positionsQuery.data.data.find(
        (position) => position.is_active,
      )
      if (preferred) setPositionId(preferred.id)
    }
  }, [positionId, positionsQuery.data])

  const mutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: Parameters<typeof UsersService.updateUser>[0]["body"]
    }) => UsersService.updateUser({ path: { user_id: id }, body }),
    onSuccess: () => {
      toast.success("Account updated")
      void qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to update account"),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (isSuperAdmin) {
        return apiRequest<OfficerUser>("/users/officers", {
          method: "POST",
          body: JSON.stringify({
            student_number: studentNumber.trim(),
            first_name: firstName.trim(),
            middle_initial: middleInitial.trim() || null,
            last_name: lastName.trim(),
            extension: extension.trim() || null,
            academic_year_id: academicYearId,
            section_id: sectionId,
            email: email.trim(),
            organization: organization.trim(),
            role,
            position_id: positionId,
          }),
        })
      }
      return UsersService.createUser({
        body: {
          email: email.trim(),
          password,
          full_name: name.trim() || undefined,
          role,
          is_active: true,
        },
      })
    },
    onSuccess: () => {
      toast.success("Account created")
      setCreateOpen(false)
      resetForm()
      void qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to create account"),
  })

  const positionMutation = useMutation({
    mutationFn: () =>
      apiRequest<OfficerPosition>("/users/officer-positions", {
        method: "POST",
        body: JSON.stringify({ name: newPositionName.trim(), is_active: true }),
      }),
    onSuccess: async () => {
      toast.success("Officer position added")
      setNewPositionName("")
      await qc.invalidateQueries({ queryKey: ["officer-positions"] })
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to add officer position"),
  })

  const previewImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch(`${api}/users/officers/import/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: form,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(body?.detail ?? "Unable to validate import file")
      return body as OfficerImportPreview
    },
    onSuccess: (preview) => {
      setImportPreview(preview)
      if (preview.can_import) {
        toast.success(`Validated ${preview.valid_rows} officer rows`)
      } else {
        toast.error(
          `Found ${preview.invalid_rows} invalid row(s). Review the errors before importing.`,
        )
      }
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const commitImportMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ created_count: number; delivery_failures: string[] }>(
        "/users/officers/import/commit",
        {
          method: "POST",
          body: JSON.stringify({
            rows: (importPreview?.rows ?? []).map((row) => row.payload),
          }),
        },
      ),
    onSuccess: async (result) => {
      toast.success(`Imported ${result.created_count} officer account(s)`)
      if (result.delivery_failures.length) {
        toast.error(
          `Email delivery failed for: ${result.delivery_failures.join(", ")}`,
        )
      }
      setImportOpen(false)
      setImportFile(null)
      setImportPreview(null)
      await qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  async function downloadImportTemplate(format: "csv" | "xlsx") {
    try {
      const response = await fetch(
        `${api}/users/officers/import/template/${format}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        },
      )
      if (!response.ok)
        throw new Error("Unable to download the import template")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download =
        format === "csv"
          ? "CCS_Officer_Import_Template.csv"
          : "CCS_Officer_Import_Template.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to download template",
      )
    }
  }

  function resetForm() {
    setStudentNumber("")
    setFirstName("")
    setMiddleInitial("")
    setLastName("")
    setExtension("")
    setOrganization("CCS Student Council")
    setName("")
    setEmail("")
    setPassword("")
    setRole(isSuperAdmin ? "admin" : "student")
    setSectionId("")
  }

  const positions = [...(positionsQuery.data?.data ?? [])].sort(
    comparePositions,
  )
  const positionName = (id?: string | null) =>
    positions.find((position) => position.id === id)?.name ?? "—"
  const users = ((query.data?.data.data ?? []) as OfficerUser[])
    .filter((u) => !u.is_developer)
    .filter((u) =>
      `${u.full_name ?? ""} ${u.email} ${u.student_number ?? ""} ${positionName(u.position_id)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">User Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuperAdmin
              ? "Manage officer identities, council positions, and system access."
              : "Manage operational accounts. Administrative privileges are reserved for Super Admins."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                Import accounts
              </Button>
              <Button
                variant="outline"
                onClick={() => setManagePositionsOpen(true)}
              >
                <Settings2 />
                Manage positions
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
          >
            <Plus />
            Add account
          </Button>
        </div>
      </div>
      <Input
        placeholder="Search by name, email, or position"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {query.isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Unable to load users.
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Position</th>
                <th className="p-3">Active</th>
                {isSuperAdmin && <th className="p-3">Scanner</th>}
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  position={positionName(u.position_id)}
                  positions={positions}
                  onEditSaved={() =>
                    void qc.invalidateQueries({ queryKey: ["admin-users"] })
                  }
                  isSuperAdmin={isSuperAdmin}
                  currentUserId={currentUser?.id}
                  onSave={(body) => mutation.mutate({ id: u.id, body })}
                  saving={mutation.isPending}
                />
              ))}
            </tbody>
          </table>
          {!query.isLoading && users.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No users found.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {isSuperAdmin ? "Add Student Council Officer" : "Add account"}
            </DialogTitle>
            <DialogDescription>
              {isSuperAdmin
                ? "Create an officer account with academic details, a council position, and a system role."
                : "Create an operational account. Class Representative assignments are managed separately."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="officer-student-number">Student ID *</Label>
                    <Input
                      id="officer-student-number"
                      value={studentNumber}
                      onChange={(e) => setStudentNumber(e.target.value)}
                      placeholder="Student ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officer-first-name">First Name *</Label>
                    <Input
                      id="officer-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officer-middle-initial">
                      Middle Initial
                    </Label>
                    <Input
                      id="officer-middle-initial"
                      value={middleInitial}
                      onChange={(e) => setMiddleInitial(e.target.value)}
                      maxLength={5}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officer-last-name">Last Name *</Label>
                    <Input
                      id="officer-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="officer-extension">Extension</Label>
                    <Input
                      id="officer-extension"
                      value={extension}
                      onChange={(e) => setExtension(e.target.value)}
                      placeholder="Jr., Sr., III (optional)"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Academic Year *</Label>
                    <Select
                      value={academicYearId}
                      onValueChange={(value) => {
                        setAcademicYearId(value)
                        setSectionId("")
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select academic year" />
                      </SelectTrigger>
                      <SelectContent>
                        {(yearsQuery.data?.data ?? []).map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.label}
                            {year.is_current ? " (Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Section *</Label>
                    <Select
                      value={sectionId}
                      onValueChange={setSectionId}
                      disabled={!academicYearId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        {(sectionsQuery.data?.data ?? []).map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.program_code} {section.section_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="account-name">Full Name</Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="account-email">Email *</Label>
              <Input
                id="account-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="name@example.com"
              />
            </div>
            {isSuperAdmin ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="officer-organization">Organization *</Label>
                  <Input
                    id="officer-organization"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>System Role *</Label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as UserRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountRoles.map((item) => (
                        <SelectItem key={item} value={item}>
                          {roleLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position *</Label>
                  <Select value={positionId} onValueChange={setPositionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select officer position" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions
                        .filter((position) => position.is_active)
                        .map((position) => (
                          <SelectItem key={position.id} value={position.id}>
                            {position.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {positions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Add a position using Manage positions before creating an
                      officer account.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  The system generates a temporary password using the same
                  procedure as Class Representative accounts. Credentials are
                  emailed, and the officer must change the password after first
                  login.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account-password">Password *</Label>
                  <Input
                    id="account-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as UserRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountRoles.map((item) => (
                        <SelectItem key={item} value={item}>
                          {roleLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !email.trim() ||
                (isSuperAdmin
                  ? !studentNumber.trim() ||
                    !firstName.trim() ||
                    !lastName.trim() ||
                    !academicYearId ||
                    !sectionId ||
                    !positionId ||
                    !organization.trim()
                  : password.length < 8)
              }
            >
              {createMutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open)
          if (!open) {
            setImportFile(null)
            setImportPreview(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Officer Accounts</DialogTitle>
            <DialogDescription>
              Upload a CSV or XLSX file. Review validation results before
              committing the import. Files can contain up to 500 accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadImportTemplate("xlsx")}
              >
                Download XLSX template
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadImportTemplate("csv")}
              >
                Download CSV template
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="officer-import-file">Officer file</Label>
              <Input
                id="officer-import-file"
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] ?? null)
                  setImportPreview(null)
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                importFile && previewImportMutation.mutate(importFile)
              }
              disabled={!importFile || previewImportMutation.isPending}
            >
              {previewImportMutation.isPending
                ? "Validating…"
                : "Validate file"}
            </Button>
            {importPreview && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border p-3 text-sm">
                    Total rows: <strong>{importPreview.total_rows}</strong>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    Valid rows: <strong>{importPreview.valid_rows}</strong>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    Invalid rows: <strong>{importPreview.invalid_rows}</strong>
                  </div>
                </div>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Row</th>
                        <th className="p-2">Student ID</th>
                        <th className="p-2">Account</th>
                        <th className="p-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row) => (
                        <tr key={row.row_number} className="border-b align-top">
                          <td className="p-2">{row.row_number}</td>
                          <td className="p-2">{row.student_number || "—"}</td>
                          <td className="p-2">
                            {row.full_name || "Invalid row"}
                            <div className="text-xs text-muted-foreground">
                              {row.position_name || "No position"}
                            </div>
                          </td>
                          <td className="p-2">
                            {row.errors.length ? (
                              <span className="text-destructive">
                                {row.errors.join("; ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!importPreview.can_import && (
                  <p className="text-sm text-destructive">
                    Import is blocked until every row is valid. Fix the source
                    file and validate it again.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => commitImportMutation.mutate()}
              disabled={
                !importPreview?.can_import || commitImportMutation.isPending
              }
            >
              {commitImportMutation.isPending
                ? "Importing…"
                : "Import accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={managePositionsOpen} onOpenChange={setManagePositionsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Officer Positions</DialogTitle>
            <DialogDescription>
              Add reusable council positions. A position is separate from a
              person's system role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newPositionName}
                onChange={(event) => setNewPositionName(event.target.value)}
                placeholder="e.g. Recording Secretary"
              />
              <Button
                onClick={() => positionMutation.mutate()}
                disabled={!newPositionName.trim() || positionMutation.isPending}
              >
                Add
              </Button>
            </div>
            {positionsQuery.isError && (
              <p className="text-sm text-destructive">
                Unable to load officer positions.
              </p>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {positions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{position.name}</span>
                  <span
                    className={
                      position.is_active
                        ? "text-muted-foreground"
                        : "text-destructive"
                    }
                  >
                    {position.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
              {positions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No positions have been added yet.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManagePositionsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserRow({
  user,
  position,
  positions,
  onSave,
  onEditSaved,
  saving,
  isSuperAdmin,
  currentUserId,
}: {
  user: OfficerUser
  position: string
  positions: OfficerPosition[]
  onSave: (body: Parameters<typeof UsersService.updateUser>[0]["body"]) => void
  onEditSaved: () => void
  saving: boolean
  isSuperAdmin: boolean
  currentUserId?: string
}) {
  const [role, setRole] = useState<UserRole>(user.role ?? "student")
  const [active, setActive] = useState(Boolean(user.is_active))
  const [scan, setScan] = useState(Boolean(user.can_scan))
  const [editOpen, setEditOpen] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [editName, setEditName] = useState(user.full_name ?? "")
  const [editEmail, setEditEmail] = useState(user.email)
  const [editStudentNumber, setEditStudentNumber] = useState(
    user.student_number ?? "",
  )
  const [editFirstName, setEditFirstName] = useState(user.first_name ?? "")
  const [editMiddleInitial, setEditMiddleInitial] = useState(
    user.middle_name ?? "",
  )
  const [editLastName, setEditLastName] = useState(user.last_name ?? "")
  const [editExtension, setEditExtension] = useState(user.name_extension ?? "")
  const [editOrganization, setEditOrganization] = useState(
    user.organization ?? "CCS Student Council",
  )
  const [editAcademicYearId, setEditAcademicYearId] = useState(
    user.academic_year_id ?? "",
  )
  const [editSectionId, setEditSectionId] = useState(user.section_id ?? "")
  const [editPositionId, setEditPositionId] = useState(user.position_id ?? "")
  const [editRole, setEditRole] = useState<UserRole>(user.role ?? "student")
  const isProtectedAccount =
    user.role === "admin" || user.role === "super_admin"
  const canEdit =
    isSuperAdmin || (!isProtectedAccount && user.id !== currentUserId)
  const hasOfficerProfile = Boolean(
    user.student_number || user.position_id || user.organization,
  )
  const editableRoles: UserRole[] = isSuperAdmin
    ? [...superAdminAccountRoles, "class_representative"]
    : user.role === "class_representative"
      ? ["student", "class_representative"]
      : ["student"]
  const editAccountRoles: UserRole[] = [
    ...superAdminAccountRoles,
    "class_representative",
  ]
  const yearsQuery = useQuery({
    queryKey: ["edit-officer-account-years"],
    queryFn: () =>
      apiRequest<{ data: AcademicYear[] }>("/academic-registry/academic-years"),
    enabled: isSuperAdmin && editOpen,
  })
  const sectionsQuery = useQuery({
    queryKey: ["edit-officer-account-sections", editAcademicYearId],
    queryFn: () =>
      apiRequest<{ data: AcademicSection[] }>(
        `/academic-registry/sections?academic_year_id=${encodeURIComponent(editAcademicYearId)}`,
      ),
    enabled: isSuperAdmin && editOpen && Boolean(editAcademicYearId),
  })
  const save = () => {
    if (
      isSuperAdmin &&
      role === "class_representative" &&
      user.role !== "class_representative"
    ) {
      openEdit("class_representative")
      toast.info(
        "Choose an academic year and section to assign this account as a Class Representative.",
      )
      return
    }
    const body: Parameters<typeof UsersService.updateUser>[0]["body"] = {
      role,
      is_active: active,
    }
    if (isSuperAdmin) {
      body.can_scan = role === "class_representative" ? false : scan
      body.is_superuser = role === "super_admin"
    }
    onSave(body)
  }
  const openEdit = (initialRole: UserRole = user.role ?? "student") => {
    setEditName(user.full_name ?? "")
    setEditEmail(user.email)
    setEditStudentNumber(user.student_number ?? "")
    setEditFirstName(user.first_name ?? "")
    setEditMiddleInitial(user.middle_name ?? "")
    setEditLastName(user.last_name ?? "")
    setEditExtension(user.name_extension ?? "")
    setEditOrganization(user.organization ?? "CCS Student Council")
    setEditAcademicYearId(user.academic_year_id ?? "")
    setEditSectionId(user.section_id ?? "")
    setEditPositionId(user.position_id ?? "")
    setEditRole(initialRole)
    setEditOpen(true)
  }
  const saveDetails = async () => {
    setSavingDetails(true)
    try {
      const payload: Record<string, unknown> = {
        email: editEmail.trim(),
        role: editRole,
        is_active: active,
      }
      if (isSuperAdmin) {
        payload.can_scan = editRole === "class_representative" ? false : scan
        payload.is_superuser = editRole === "super_admin"
        if (hasOfficerProfile) {
          Object.assign(payload, {
            student_number: editStudentNumber.trim(),
            first_name: editFirstName.trim(),
            middle_name: editMiddleInitial.trim() || null,
            last_name: editLastName.trim(),
            name_extension: editExtension.trim() || null,
            organization: editOrganization.trim(),
            position_id: editPositionId,
          })
        }
        if (
          editRole === "class_representative" &&
          user.role !== "class_representative"
        ) {
          payload.academic_year_id = editAcademicYearId
          payload.section_id = editSectionId
        } else if (hasOfficerProfile && editAcademicYearId && editSectionId) {
          payload.academic_year_id = editAcademicYearId
          payload.section_id = editSectionId
        }
      } else {
        payload.full_name = editName.trim()
      }
      await apiRequest<OfficerUser>(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      toast.success("Account details updated")
      setEditOpen(false)
      onEditSaved()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update account",
      )
    } finally {
      setSavingDetails(false)
    }
  }
  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{user.full_name || "—"}</td>
      <td className="p-3">{user.email}</td>
      <td className="p-3">
        <Select
          value={role}
          onValueChange={(value) => setRole(value as UserRole)}
          disabled={!canEdit}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {editableRoles.map((item) => (
              <SelectItem key={item} value={item}>
                {roleLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3">{position}</td>
      <td className="p-3">
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          onClick={() => setActive(!active)}
          disabled={!canEdit || user.id === currentUserId}
          title={
            user.id === currentUserId
              ? "You cannot deactivate your own account"
              : undefined
          }
        >
          {active ? "Active" : "Inactive"}
        </Button>
      </td>
      {isSuperAdmin && (
        <td className="p-3">
          <Button
            size="sm"
            variant={scan ? "default" : "outline"}
            onClick={() => setScan(!scan)}
            disabled={!canEdit}
          >
            {scan ? "Allowed" : "Denied"}
          </Button>
        </td>
      )}
      <td className="p-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving || !canEdit}>
            Save access
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => openEdit()}
          >
            <Pencil className="mr-1 size-3.5" /> Edit
          </Button>
        </div>
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) setRole(user.role ?? "student")
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {isSuperAdmin ? "Edit Student Council Officer" : "Edit account"}
              </DialogTitle>
              <DialogDescription>
                Update the same account details available when creating this
                account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {isSuperAdmin ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Student ID *</Label>
                      <Input
                        value={editStudentNumber}
                        onChange={(event) =>
                          setEditStudentNumber(event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>First Name *</Label>
                      <Input
                        value={editFirstName}
                        onChange={(event) =>
                          setEditFirstName(event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Middle Initial</Label>
                      <Input
                        value={editMiddleInitial}
                        onChange={(event) =>
                          setEditMiddleInitial(event.target.value)
                        }
                        maxLength={5}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name *</Label>
                      <Input
                        value={editLastName}
                        onChange={(event) =>
                          setEditLastName(event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Extension</Label>
                      <Input
                        value={editExtension}
                        onChange={(event) =>
                          setEditExtension(event.target.value)
                        }
                        placeholder="Jr., Sr., III (optional)"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Academic Year *</Label>
                      <Select
                        value={editAcademicYearId}
                        onValueChange={(value) => {
                          setEditAcademicYearId(value)
                          setEditSectionId("")
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select academic year" />
                        </SelectTrigger>
                        <SelectContent>
                          {(yearsQuery.data?.data ?? []).map((year) => (
                            <SelectItem key={year.id} value={year.id}>
                              {year.label}
                              {year.is_current ? " (Default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Section *</Label>
                      <Select
                        value={editSectionId}
                        onValueChange={setEditSectionId}
                        disabled={!editAcademicYearId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent>
                          {(sectionsQuery.data?.data ?? []).map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.program_code} {section.section_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(event) => setEditEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Organization *</Label>
                    <Input
                      value={editOrganization}
                      onChange={(event) =>
                        setEditOrganization(event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>System Role *</Label>
                      <Select
                        value={editRole}
                        onValueChange={(value) =>
                          setEditRole(value as UserRole)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {editAccountRoles.map((item) => (
                            <SelectItem key={item} value={item}>
                              {roleLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Position *</Label>
                      <Select
                        value={editPositionId}
                        onValueChange={setEditPositionId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select officer position" />
                        </SelectTrigger>
                        <SelectContent>
                          {positions
                            .filter((item) => item.is_active)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(event) => setEditEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={editRole}
                      onValueChange={(value) => setEditRole(value as UserRole)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {editableRoles.map((item) => (
                          <SelectItem key={item} value={item}>
                            {roleLabel(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={savingDetails}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  savingDetails ||
                  !editEmail.trim() ||
                  (isSuperAdmin &&
                    hasOfficerProfile &&
                    (!editStudentNumber.trim() ||
                      !editFirstName.trim() ||
                      !editLastName.trim() ||
                      !editPositionId ||
                      !editOrganization.trim())) ||
                  (isSuperAdmin &&
                    editRole === "class_representative" &&
                    user.role !== "class_representative" &&
                    (!editAcademicYearId || !editSectionId))
                }
                onClick={() => void saveDetails()}
              >
                {savingDetails ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  )
}

function roleLabel(role: UserRole) {
  switch (role) {
    case "super_admin":
      return "Super Admin"
    case "admin":
      return "Admin"
    case "class_representative":
      return "Class Representative"
    case "student":
      return "Student"
  }
}
