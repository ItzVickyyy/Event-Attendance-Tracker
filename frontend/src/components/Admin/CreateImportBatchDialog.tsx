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

    try {
      setIsProcessing(true)

      // 1. Create the Import Batch record
      const batchRes = await ImportBatchesService.batchesCreateImportBatch({
        body: {
          source_filename: selectedFile.name,
          academic_year: academicYear,
          semester: semester,
          notes: notes || undefined,
        },
      })

      const batch = batchRes.data

      // 2. Upload the workbook to parse & validate staging records
      const uploadRes =
        await ImportBatchesService.batchesUploadImportBatchWorkbook({
          path: { batch_id: batch.id },
          body: { file: selectedFile },
        })

      toast.success(
        `Batch created and parsed! Total rows: ${(uploadRes.data as any).total_rows}, Valid: ${(uploadRes.data as any).valid_rows}`,
      )
      queryClient.invalidateQueries({ queryKey: ["importBatches"] })
      setOpen(false)
      setSelectedFile(null)
      setNotes("")
    } catch (err: any) {
      toast.error(err.message || "Failed to create and upload batch")
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
            Create an import batch and upload the student masterlist Excel
            (.xlsx) workbook.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateAndUpload} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="academic-year">Academic Year</Label>
              <Input
                id="academic-year"
                placeholder="2025-2026"
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
              accept=".xlsx,.xls"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setSelectedFile(e.target.files[0])
                }
              }}
              required
            />
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
                  Uploading & Validating...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Stage
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
