import { useState } from "react"
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  academicYear: any
  sections: any[]
  onImported: () => void
}

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`
}

function authHeaders(extra: Record<string, string> = {}) {
  const token = localStorage.getItem("access_token")
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: authHeaders({ ...(init?.headers as Record<string, string> | undefined) }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? "Request failed")
  }
  return response.json()
}

export function StudentImportDialog({
  open,
  onOpenChange,
  academicYear,
  sections,
  onImported,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [defaultSectionId, setDefaultSectionId] = useState("")
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [promoting, setPromoting] = useState(false)

  const reset = () => {
    setFile(null)
    setDefaultSectionId("")
    setBatchId(null)
    setResult(null)
    setUploading(false)
    setPromoting(false)
  }

  const close = (value: boolean) => {
    if (!value) reset()
    onOpenChange(value)
  }

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    try {
      const response = await fetch(apiUrl(`/import-batches/template/${format}`), {
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error("Unable to download template")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `Event_Attendance_Tracker_Student_Import_Template.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download template")
    }
  }

  const upload = async () => {
    if (!file) {
      toast.error("Select an XLSX or CSV file first")
      return
    }

    setUploading(true)
    try {
      const batch = await apiJson<any>("/import-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_filename: file.name,
          academic_year: academicYear?.label,
          default_section_id: defaultSectionId || null,
        }),
      })

      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(apiUrl(`/import-batches/${batch.id}/upload`), {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail ?? "Unable to validate import")
      }

      const data = await response.json()
      setBatchId(batch.id)
      setResult(data)
      toast.success("Import validated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to validate import")
    } finally {
      setUploading(false)
    }
  }

  const confirmImport = async () => {
    if (!batchId || !result || result.valid_rows === 0 || result.invalid_rows > 0 || result.conflict_rows > 0) return
    setPromoting(true)
    try {
      const data = await apiJson<any>(`/import-batches/${batchId}/promote`, { method: "POST" })
      toast.success(`Imported ${data.newly_promoted_rows} student(s)`)
      onImported()
      close(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete import")
    } finally {
      setPromoting(false)
    }
  }

  const reconciliation = result?.summary_reconciliation
  const reconciliationBlocked = Boolean(
    reconciliation && reconciliation.status !== "matched" && reconciliation.summary_sheet_found,
  )
  const canConfirm = Boolean(
    batchId &&
      result &&
      result.valid_rows > 0 &&
      result.invalid_rows === 0 &&
      result.conflict_rows === 0 &&
      !reconciliationBlocked &&
      result.can_promote !== false,
  )

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Students</DialogTitle>
          <DialogDescription>
            Import student masterlist data into Academic Year {academicYear?.label ?? "selected year"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!result ? (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="font-semibold">Before you upload</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Supported files are XLSX and CSV.</li>
                  <li>You can use one section per sheet, one workbook containing all sections, or one combined sheet with a Section column.</li>
                  <li>For CSV files without a Section column, select the section below.</li>
                  <li>The Academic Year is taken from the selected year. Do not put it in every row.</li>
                  <li>The import is validated before any student is added or updated.</li>
                  <li>Rows with errors or conflicts cannot be confirmed until they are fixed.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Required columns</p>
                <p className="text-sm text-muted-foreground">
                  Student Number, Last Name, First Name, Middle Name, Name Extension, Mobile Number, Email, Section, Academic Status
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void downloadTemplate("xlsx")}>
                  <FileSpreadsheet /> Download Excel Template
                </Button>
                <Button variant="outline" onClick={() => void downloadTemplate("csv")}>
                  <Download /> Download CSV Template
                </Button>
              </div>

              {file?.name.toLowerCase().endsWith(".xlsx") ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Section detection is automatic</p>
                  <p className="mt-1 text-muted-foreground">
                    For Excel workbooks, the system reads the section from each sheet and checks it against the selected Academic Year. You do not need to choose sections manually.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">Default section for a CSV without Section</p>
                <Select value={defaultSectionId} onValueChange={setDefaultSectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional. Select only when Section is not in the file" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section: any) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.program_code} {section.section_code} · {section.year_level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <FileUp className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">{file?.name ?? "Choose your masterlist file"}</p>
                <p className="mt-1 text-sm text-muted-foreground">XLSX or CSV</p>
                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  className="mt-4 cursor-pointer"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="font-medium">Validation complete</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><p className="text-2xl font-semibold">{result.total_rows}</p><p className="text-xs text-muted-foreground">Total rows</p></div>
                  <div><p className="text-2xl font-semibold">{result.valid_rows}</p><p className="text-xs text-muted-foreground">Valid</p></div>
                  <div><p className="text-2xl font-semibold">{result.invalid_rows}</p><p className="text-xs text-muted-foreground">Errors</p></div>
                  <div><p className="text-2xl font-semibold">{result.conflict_rows}</p><p className="text-xs text-muted-foreground">Conflicts</p></div>
                </div>
              </div>

              {reconciliationBlocked ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Source totals do not match</p>
                      <p className="mt-1 text-muted-foreground">
                        The workbook Summary does not match the student rows that were actually detected. Nothing will be imported until the source workbook is corrected.
                      </p>
                      {reconciliation?.discrepancies?.length ? (
                        <ul className="mt-2 list-disc pl-5">
                          {reconciliation.discrepancies.map((item: string) => <li key={item}>{item}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : result.invalid_rows > 0 || result.conflict_rows > 0 ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium">Import cannot be confirmed yet.</p>
                  <p className="mt-1 text-muted-foreground">
                    Fix the reported rows in the source file, then upload the corrected file as a new validation batch.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4" />
                    <p className="font-medium">Ready to import</p>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {result.valid_rows} validated row(s) will be promoted into the selected academic year.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          {!result ? (
            <Button onClick={() => void upload()} disabled={!file || uploading}>
              <Upload />
              {uploading ? "Validating…" : "Validate Import"}
            </Button>
          ) : (
            <Button onClick={() => void confirmImport()} disabled={!canConfirm || promoting}>
              {promoting ? "Importing…" : "Confirm Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
