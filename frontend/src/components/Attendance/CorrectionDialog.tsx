import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AttendanceCorrectionsService } from "@/client"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AttendancePublic, AttendanceStatus } from "@/client"

const correctionSchema = z.object({
  attendance_id: z.string(),
  reason: z.string().min(1, "Reason is required").max(500),
  new_time_in: z.string().nullable().optional(),
  new_time_out: z.string().nullable().optional(),
  new_status: z.string().nullable().optional(),
})

type CorrectionFormValues = z.infer<typeof correctionSchema>

interface AttendanceCorrectionDialogProps {
  attendance: AttendancePublic
  isOpen: boolean
  onClose: () => void
}

export function AttendanceCorrectionDialog({
  attendance,
  isOpen,
  onClose,
}: AttendanceCorrectionDialogProps) {
  const queryClient = useQueryClient()
  
  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: {
      attendance_id: attendance.id,
      reason: "",
      new_time_in: attendance.time_in || null,
      new_time_out: attendance.time_out || null,
      new_status: attendance.status || null,
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: CorrectionFormValues) => {
      return await AttendanceCorrectionsService.correctionsCreateAttendanceCorrection({
        body: {
          attendance_id: values.attendance_id,
          reason: values.reason,
          old_time_in: attendance.time_in || null,
          new_time_in: values.new_time_in || null,
          old_time_out: attendance.time_out || null,
          new_time_out: values.new_time_out || null,
          old_status: (attendance.status as AttendanceStatus) || null,
          new_status: (values.new_status as AttendanceStatus) || null,
        },
      })
    },
    onSuccess: () => {
      toast.success("Attendance record corrected successfully")
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      onClose()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to correct attendance record")
    },
  })

  const onSubmit = (values: CorrectionFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct Attendance</DialogTitle>
          <DialogDescription>
            Modify attendance record for registration {attendance.registration_id}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Correction</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Student arrived late due to traffic" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="new_time_in"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Time-In</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field} 
                        value={field.value ?? ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="new_time_out"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Time-Out</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field} 
                        value={field.value ?? ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="new_status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="time_in_only">Time-In Only</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Correction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
