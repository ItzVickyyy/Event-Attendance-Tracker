import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Upload } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ImportBatchesService } from "@/client"
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

type ImportValidationResult = {
  total_rows: number
  valid_rows: number
  invalid_rows: number
  conflict_rows: number
  can_promote: boolean
}

type PromotionResult = {
  newly_promoted_rows: number
  already_promoted_rows: number
  blocked_rows: Array<{ reason: string }>
  batch_status: string
}

export function CreateImportBatchDialog() {
  const [open, setOpen] = useState(false)
  const [academicYear, setAcademicYear] = useState(
    new Date().getFullYear().toString(),
  )
  const [semester, setSemester] = useState("1")
  const [notes, setNotes] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const queryClient = useQueryClient()

  const handleCreateAndUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      toast.error("Please select an Excel (.xlsx) file to upload")
      return
    }

    let batchCreated = false
    let promotionAttempted = false

    try {
      setIsProcessing(true)

      const batchRes = await ImportBatchesService.batchesCreateImportBatch({
        body: {
          source_filename: selectedFile.name,
          academic_year: academicYear,
          semester: semester,
          notes: notes || undefined,
        },
      })

      const batch = batchRes.data
      batchCreated = true
      const uploadRes =
        await ImportBatchesService.batchesUploadImportBatchWorkbook({
          path: { batch_id: batch.id },
          body: { file: selectedFile },
        })
      const validation = uploadRes.data as ImportValidationResult

      if (
        !validation.can_promote ||
        validation.valid_rows === 0 ||
        validation.invalid_rows > 0 ||
        validation.conflict_rows > 0
      ) {
        toast.warning(
          `Uploaded for review. Valid: ${validation.valid_rows}, errors: ${validation.invalid_rows}, conflicts: ${validation.conflict_rows}. No students were promoted.`,
        )
      } else {
        // Clean batches are promoted immediately. The backend rechecks the
        // batch status, validation errors, conflicts, and source reconciliation.
        promotionAttempted = true
        const promotionRes =
          await ImportBatchesService.batchesPromoteImportBatch({
            path: { batch_id: batch.id },
          })
        const promotion = promotionRes.data as PromotionResult
        const blockedCount = promotion.blocked_rows?.length ?? 0

        if (blockedCount > 0) {
          toast.warning(
            `Imported ${promotion.newly_promoted_rows} student(s). ${blockedCount} row(s) need attention. Open the batch to review them.`,
          )
        } else {
          const imported =
            promotion.newly_promoted_rows + promotion.already_promoted_rows
          toast.success(
            `Import complete. ${imported} student(s) are now in the student roster.`,
          )
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["importBatches"] })
      if (promotionAttempted) {
        await queryClient.invalidateQueries({ queryKey: ["students"] })
      }
      setOpen(false)
      setSelectedFile(null)
      setNotes("")
    } catch (err: any) {
      toast.error(
        err.message ||
          "The batch was created, but upload or promotion could not be completed. Check Import Batches before trying again.",
      )
      if (batchCreated) {
        await queryClient.invalidateQueries({ queryKey: ["importBatches"] })
      }
      if (promotionAttempted) {
        await queryClient.invalidateQueries({ queryKey: ["students"] })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Import Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Student Masterlist</DialogTitle>
          <DialogDescription>
            Upload a student masterlist workbook. Clean, validated records are
            automatically added to the student roster. Files with validation
            issues remain staged for review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateAndUpload} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="academic-year">Academic Year</Label>
              <Input
                id="academic-year"
                placeholder="2026-2027"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semester">Semester</Label>
              <Input
                id="semester"
                placeholder="1"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Description / Notes (Optional)</Label>
            <Input
              id="notes"
              placeholder="e.g. Second semester enrolled students"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file-upload">Excel Workbook (.xlsx)</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setSelectedFile(e.target.files[0])
                }
              }}
              required
            />
            <p className="text-xs text-muted-foreground">
              Supported formats: .xlsx and .csv
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isProcessing || !selectedFile}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading & Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Import
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default CreateImportBatchDialog
