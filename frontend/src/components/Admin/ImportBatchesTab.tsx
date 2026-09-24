import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Eye, FileSpreadsheet, Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ImportBatchesService, type ImportBatchPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import BatchDetailsDialog from "./BatchDetailsDialog"
import CreateImportBatchDialog from "./CreateImportBatchDialog"

export function ImportBatchesTab() {
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchPublic | null>(
    null,
  )
  const [detailsOpen, setDetailsOpen] = useState(false)
  const queryClient = useQueryClient()

  const {
    data: batchesResponse,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["importBatches"],
    queryFn: async () => {
      const res = await ImportBatchesService.batchesReadImportBatches({
        query: { skip: 0, limit: 100 },
      })
      return res.data
    },
  })

  const batches: ImportBatchPublic[] = batchesResponse?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await ImportBatchesService.batchesDeleteImportBatch({
        path: { batch_id: id },
      })
    },
    onSuccess: () => {
      toast.success("Batch deleted successfully")
      refetch()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete batch")
    },
  })

  const promoteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await ImportBatchesService.batchesPromoteImportBatch({
        path: { batch_id: id },
      })
    },
    onSuccess: (data: any) => {
      toast.success(
        `Batch promoted! Created: ${data.data?.students_created ?? 0}, Updated: ${data.data?.students_updated ?? 0}`,
      )
      refetch()
      queryClient.invalidateQueries({ queryKey: ["students"] })
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to promote batch")
    },
  })

  const handleOpenDetails = (batch: ImportBatchPublic) => {
    setSelectedBatch(batch)
    setDetailsOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Student Import Batches</h2>
          <p className="text-sm text-muted-foreground">
            Stage masterlist spreadsheets, review validation results, and
            promote clean records into active students.
          </p>
        </div>
        <CreateImportBatchDialog />
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mb-2 opacity-50" />
            <h3 className="font-semibold text-foreground">No import batches</h3>
            <p className="text-sm">
              Click "New Import Batch" to upload a student masterlist.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Academic Year / Sem</TableHead>
                <TableHead>Imported At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                    <span
                      className="truncate max-w-[240px]"
                      title={batch.source_filename}
                    >
                      {batch.source_filename}
                    </span>
                  </TableCell>
                  <TableCell>
                    AY {batch.academic_year || "N/A"} • Sem{" "}
                    {batch.semester || "N/A"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {batch.imported_at
                      ? new Date(batch.imported_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        batch.status === "promoted"
                          ? "text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950"
                          : batch.status === "validated"
                            ? "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950"
                            : "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950"
                      }
                    >
                      {batch.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDetails(batch)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View / Staging
                      </Button>
                      {batch.status !== "promoted" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => promoteMutation.mutate(batch.id)}
                          disabled={promoteMutation.isPending}
                        >
                          {promoteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4 mr-1" />
                          )}
                          Promote
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(batch.id)}
                        disabled={deleteMutation.isPending}
                        title="Delete batch"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <BatchDetailsDialog
        batch={selectedBatch}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  )
}
export default ImportBatchesTab
