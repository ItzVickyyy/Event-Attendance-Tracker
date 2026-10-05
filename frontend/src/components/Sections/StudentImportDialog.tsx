import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp } from "lucide-react"
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

const TUTORIAL_SEEN_KEY = "student-import-tutorial-seen"
const SKIP_TUTORIAL_KEY = "student-import-tutorial-skip"

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
  const [step, setStep] = useState(0)
  const [tutorialSeen, setTutorialSeen] = useState(false)
  const [rememberSkip, setRememberSkip] = useState(false)

  useEffect(() => {
    if (!open) return

    const seen = localStorage.getItem(TUTORIAL_SEEN_KEY) === "true"
    const skip = localStorage.getItem(SKIP_TUTORIAL_KEY) === "true"

    setTutorialSeen(seen)
    setRememberSkip(skip)
    setStep(skip ? 3 : 0)
  }, [open])

  const reset = () => {
    setFile(null)
    setDefaultSectionId("")
    setBatchId(null)
    setResult(null)
    setUploading(false)
    setPromoting(false)
    setStep(0)
    setRememberSkip(false)
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
      const batch = await apiJson<any>("/import-batches/", {
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

  const markTutorialPreference = () => {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "true")
    setTutorialSeen(true)

    if (rememberSkip) {
      localStorage.setItem(SKIP_TUTORIAL_KEY, "true")
    } else {
      localStorage.removeItem(SKIP_TUTORIAL_KEY)
    }
  }

  const nextStep = () => {
    if (step === 0) {
      markTutorialPreference()
      setStep(1)
      return
    }

    if (step === 1) {
      setStep(2)
      return
    }

    if (step === 2) {
      setStep(3)
      return
    }

    if (step === 3) {
      void upload()
    }
  }

  const skipTutorial = () => {
    if (!tutorialSeen) return

    if (rememberSkip) {
      localStorage.setItem(SKIP_TUTORIAL_KEY, "true")
    }

    setStep(3)
  }

  const restartUpload = () => {
    setFile(null)
    setDefaultSectionId("")
    setBatchId(null)
    setResult(null)
    setStep(3)
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

  const tutorialSteps = [
    { title: "Before you upload", description: "Understand the import rules first." },
    { title: "Download template", description: "Use the correct file structure." },
    { title: "Prepare your file", description: "Check sections and required columns." },
    { title: "Upload and validate", description: "Upload the masterlist and review the result." },
  ]

  const currentStep = tutorialSteps[step]

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Students</DialogTitle>
          <DialogDescription>
            Import student masterlist data into Academic Year {academicYear?.label ?? "selected year"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!result && (
            <div className="grid grid-cols-4 gap-2">
              {tutorialSteps.map((item, index) => (
                <div key={item.title} className="space-y-1">
                  <div className={`h-1.5 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />
                  <p className={`text-xs ${index === step ? "font-medium" : "text-muted-foreground"}`}>
                    Step {index + 1}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {result ? "Step 4" : `Step ${step + 1} of 4`}
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {result ? "Review and confirm" : currentStep.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {result ? "Review the validation result before importing any students." : currentStep.description}
            </p>
          </div>

          {!result ? (
            <>
              {step === 0 && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-sm">
                      Student imports can create or update many records at once. Follow the steps carefully so the source file matches the system before anything is imported.
                    </p>
                    <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                      <li>Use XLSX or CSV files only.</li>
                      <li>The Academic Year comes from the year selected in the system.</li>
                      <li>Excel section sheets are detected automatically.</li>
                      <li>The system validates the entire file before any student is added or updated.</li>
                      <li>Rows with errors, conflicts, or mismatched source totals cannot be imported.</li>
                    </ul>
                  </div>

                  {tutorialSeen && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={rememberSkip}
                          onChange={(event) => setRememberSkip(event.target.checked)}
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span className="text-sm">
                          <span className="font-medium">Remember my choice</span>
                          <span className="block text-muted-foreground">
                            Skip this tutorial automatically next time I import students.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Start with the official template. Do not create a different column structure unless the system explicitly supports it.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="outline" className="h-auto justify-start p-4" onClick={() => void downloadTemplate("xlsx")}>
                      <FileSpreadsheet className="mr-3 size-5" />
                      <span className="text-left">
                        <span className="block font-medium">Excel template</span>
                        <span className="block text-xs text-muted-foreground">Recommended for registrar masterlists</span>
                      </span>
                    </Button>
                    <Button variant="outline" className="h-auto justify-start p-4" onClick={() => void downloadTemplate("csv")}>
                      <Download className="mr-3 size-5" />
                      <span className="text-left">
                        <span className="block font-medium">CSV template</span>
                        <span className="block text-xs text-muted-foreground">For simple single-sheet imports</span>
                      </span>
                    </Button>
                  </div>
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">Recommended</p>
                    <p className="mt-1 text-muted-foreground">
                      Use the Excel template when your registrar provides one workbook with separate sheets for sections.
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">Supported workbook formats</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      <li>One section per Excel sheet</li>
                      <li>One workbook containing multiple section sheets</li>
                      <li>One combined sheet with a Section column</li>
                      <li>CSV with a Section column</li>
                      <li>CSV without a Section column, using the fallback section selector during upload</li>
                    </ul>
                  </div>

                  <div>
                    <p className="text-sm font-medium">Required columns</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Student Number, Last Name, First Name, Middle Name, Name Extension, Mobile Number, Email, Section, Academic Status
                    </p>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">For Excel files</p>
                    <p className="mt-1 text-muted-foreground">
                      Section detection is automatic. The system reads section names from workbook sheets and checks them against the selected Academic Year.
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">Academic Year</p>
                    <p className="mt-1 text-muted-foreground">
                      {academicYear?.label ?? "Selected year"} is used for this import. You do not need to enter the Academic Year in every row.
                    </p>
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
                    <p className="text-xs text-muted-foreground">
                      Leave this empty for Excel files or files that already contain a Section column.
                    </p>
                  </div>
                </div>
              )}
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
          {result ? (
            <>
              <Button variant="outline" onClick={restartUpload}>Upload another file</Button>
              <Button onClick={() => void confirmImport()} disabled={!canConfirm || promoting}>
                {promoting ? "Importing…" : "Confirm Import"}
              </Button>
            </>
          ) : (
            <>
              {tutorialSeen ? (
                <Button variant="ghost" onClick={skipTutorial}>Skip Tutorial</Button>
              ) : null}
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={nextStep} disabled={step === 3 && (!file || uploading)}>
                {step === 3 ? (uploading ? "Validating…" : "Next") : "Next"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
