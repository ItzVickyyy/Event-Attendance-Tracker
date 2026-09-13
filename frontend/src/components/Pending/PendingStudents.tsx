import { Skeleton } from "@/components/ui/skeleton"

export function PendingStudents() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-48" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="grid grid-cols-8 gap-4 p-4 border rounded-lg">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

export default PendingStudents
