import type { ReactNode } from "react"

export default function StatsCard({ title, value, sub, icon }: {
  title: string
  value: string | number
  sub?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-border-light">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-muted">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs text-text-muted">{title}</div>
          <div className="mt-0.5 text-xl font-bold text-text-primary tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-text-dim">{sub}</div>}
        </div>
      </div>
    </div>
  )
}
