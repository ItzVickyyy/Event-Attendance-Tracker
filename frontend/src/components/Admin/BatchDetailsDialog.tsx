import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ImportBatchesService, type ImportBatchPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface StagedRecord {
  id: string
  import_batch_id: string
  source_sheet: string
  source_row: number
  source_no?: number | null
  raw_student_number: string
  raw_last_name: string
  raw_first_name: string
  raw_middle_name?: string | null
  raw_mobile_number?: string | null
  raw_email?: string | null
  raw_subjects_enrolled?: string | null
  raw_status?: string | null
  academic_status?: string | null
  validation_status: "valid" | "invalid" | "conflict_cross_program"
  validation_errors?: string[]
  promoted_student_id?: string | null
  promoted_at?: string | null
}

interface BatchDetailsDialogProps {
  batch: ImportBatchPublic | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BatchDetailsDialog({
  batch,
  open,
  onOpenChange,
}: BatchDetailsDialogProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const queryClient = useQueryClient()

  // Fetch staged student import records for this batch
  const {
    data: recordsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["batchRecords", batch?.id, statusFilter],
    queryFn: async () => {
      if (!batch?.id) return { data: [], count: 0 }
      const token = localStorage.getItem("access_token")
      const params = new URLSearchParams({ limit: "100" })
      if (statusFilter && statusFilter !== "all") {
        params.append("validation_status", statusFilter)
      }
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/v1/import-batches/${batch.id}/records?${params.toString()}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      )
      if (!res.ok) throw new Error("Failed to load records")
      return (await res.json()) as {
        data: StagedRecord[]
        count: number
      }
    },
    enabled: !!batch?.id && open,
  })

  // Promote Mutation
  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (!batch?.id) throw new Error("No batch")
      return await ImportBatchesService.batchesPromoteImportBatch({
        path: { batch_id: batch.id },
      })
    },
    onSuccess: (data: any) => {
      toast.success(
        `Batch promoted! Created: ${data.data?.students_created ?? 0}, Updated: ${data.data?.students_updated ?? 0}`,
      )
      queryClient.invalidateQueries({ queryKey: ["importBatches"] })
      refetch()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to promote batch")
    },
  })

  if (!batch) return null

  const records = recordsData?.data ?? []
  const totalCount = recordsData?.count ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                {batch.source_filename}
              </DialogTitle>
              <DialogDescription>
                AY {batch.academic_year || "N/A"} • Sem{" "}
                {batch.semester || "N/A"} • Status:{" "}
                <span className="font-semibold uppercase text-foreground">
                  {batch.status}
                </span>
              </DialogDescription>
            </div>

            {batch.status !== "promoted" && (
              <Button
                onClick={() => promoteMutation.mutate()}
                disabled={promoteMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                {promoteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Promote Clean Records to Live
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Filters and Counters */}
        <div className="flex items-center justify-between gap-4 py-2 border-b">
          <div className="text-sm font-medium text-muted-foreground">
            Staging Records ({totalCount} total)
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Filter status:
            </span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Records</SelectItem>
                <SelectItem value="valid">Valid only</SelectItem>
                <SelectItem value="invalid">Invalid only</SelectItem>
                <SelectItem value="conflict_cross_program">
                  Cross-program Conflict
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table list of staging rows */}
        <div className="flex-1 overflow-auto rounded-md border mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No staging records found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Sheet / Row</TableHead>
                  <TableHead>Student No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Promoted?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => {
                  const isClean = rec.validation_status === "valid"
                  const isPromoted = !!rec.promoted_student_id

                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-mono text-xs">
                        {rec.source_sheet}:{rec.source_row}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {rec.raw_student_number}
                      </TableCell>
                      <TableCell className="text-xs">
                        {[
                          rec.raw_first_name,
                          rec.raw_middle_name,
                          rec.raw_last_name,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {rec.raw_status || rec.academic_status || "—"}
                      </TableCell>
                      <TableCell>
                        {isClean ? (
                          <Badge
                            variant="outline"
                            className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Valid
                          </Badge>
                        ) : rec.validation_status ===
                          "conflict_cross_program" ? (
                          <Badge
                            variant="outline"
                            className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950"
                            title={rec.validation_errors?.join("; ")}
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Conflict
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-rose-600 border-rose-300 bg-rose-50 dark:bg-rose-950"
                            title={rec.validation_errors?.join("; ")}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Invalid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {isPromoted ? (
                          <span className="text-emerald-600 font-medium">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default BatchDetailsDialog
