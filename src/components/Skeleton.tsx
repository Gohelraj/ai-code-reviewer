export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />
  );
}

export function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="pt-4 border-t border-border flex gap-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlowSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex gap-5">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border rounded-2xl p-5 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
