import { Card, CardContent, CardHeader } from './card'
import { Skeleton } from './skeleton'

function ShellSkeletonHeader() {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-slate-100 bg-white/90 p-6 shadow-sm md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-9 w-56 rounded-2xl" />
        <Skeleton className="h-4 w-[420px] max-w-full rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-32 rounded-2xl" />
        <Skeleton className="h-10 w-28 rounded-2xl" />
        <Skeleton className="h-10 w-24 rounded-2xl" />
      </div>
    </div>
  )
}

function ShellCardGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <Card key={item} variant="metric">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-2xl" />
            </div>
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-5/6 rounded-full" />
            <div className="flex flex-wrap gap-2 pt-1">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <ShellSkeletonHeader />

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="card-l2">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-10 w-10 rounded-2xl" />
              </div>
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-4 w-32 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <ShellCardGrid />
    </div>
  )
}

export function ProjectListSkeleton() {
  return (
    <div className="space-y-6">
      <ShellSkeletonHeader />
      <ShellCardGrid />
    </div>
  )
}

export function RiskManagementSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <ShellSkeletonHeader />
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Skeleton className="h-3 w-20 rounded-full" />
                  <Skeleton className="mt-2 h-8 w-16 rounded-full" />
                  <Skeleton className="mt-2 h-3 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-40 rounded-full" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-5 w-12 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="mt-2 h-4 w-3/4 rounded-full" />
                    <Skeleton className="mt-2 h-3 w-1/2 rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GanttViewSkeleton() {
  return (
    <div className="space-y-6">
      <ShellSkeletonHeader />
      <div className="grid gap-4 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Card key={item} variant="metric">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card variant="detail">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-48 rounded-full" />
          <Skeleton className="h-4 w-80 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center gap-4">
                <Skeleton className="h-6 w-32 rounded-full" />
                <Skeleton className="h-6 flex-1 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card variant="detail">
      <CardContent className="space-y-3 p-5">
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-2">
          {[...Array(rows)].map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <Skeleton className="h-4 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function TaskListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <Card key={item} className="card-l2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3 rounded-full" />
                <Skeleton className="h-4 w-1/2 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function StatsCardSkeleton() {
  return (
    <Card className="card-l2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="mt-1 h-3 w-20 rounded-full" />
      </CardContent>
    </Card>
  )
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <StatsCardSkeleton key={item} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="card-l2">
          <CardHeader>
            <Skeleton className="h-6 w-32 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full rounded-[24px]" />
          </CardContent>
        </Card>
        <Card className="card-l2">
          <CardHeader>
            <Skeleton className="h-6 w-32 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full rounded-[24px]" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function TeamMembersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-2xl" />
      </div>

      <Card className="card-l2">
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 rounded-full" />
                    <Skeleton className="h-3 w-32 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function MilestonesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-2xl" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="card-l2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32 rounded-full" />

      <Card className="card-l2">
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-4 w-60 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-10 w-32 rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  )
}
