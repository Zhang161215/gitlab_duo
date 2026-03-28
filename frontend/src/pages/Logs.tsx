import { useEffect, useState } from "react"
import { useToast } from "../components/Toast"
import { fetchLogs, getErrorMessage, type LogEntry, type LogsResponse } from "../api"
import { RefreshCw, ArrowDownToLine, ArrowUpFromLine, Filter } from "lucide-react"

type StatusFilter = "all" | "success" | "error"

export default function Logs() {
  const [data, setData] = useState<LogsResponse>({ entries: [], total: 0 })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [modelFilter, setModelFilter] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    let disposed = false
    let active: AbortController | null = null
    const load = async (showError: boolean) => {
      active?.abort()
      const ctrl = active = new AbortController()
      try {
        const res = await fetchLogs(100, 0, ctrl.signal)
        if (!disposed) setData(res)
      } catch (e) {
        if (showError && !ctrl.signal.aborted && !disposed) toast(getErrorMessage(e), "error")
      }
    }
    void load(true)
    const timer = setInterval(() => void load(false), 3000)
    return () => { disposed = true; clearInterval(timer); active?.abort() }
  }, [toast])

  // Get unique models for filter
  const models = [...new Set(data.entries.map(e => e.model))].sort()

  // Apply filters
  const filtered = data.entries.filter(e => {
    if (statusFilter === "success" && (e.status < 200 || e.status >= 400)) return false
    if (statusFilter === "error" && e.status >= 200 && e.status < 400) return false
    if (modelFilter && e.model !== modelFilter) return false
    return true
  })

  const successCount = data.entries.filter(e => e.status >= 200 && e.status < 400).length
  const errorCount = data.entries.length - successCount

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">请求日志</h1>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: "3s" }} />
          共 {data.total} 条 · 3s 刷新
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {([
            { id: "all" as StatusFilter, label: "全部", count: data.entries.length },
            { id: "success" as StatusFilter, label: "成功", count: successCount },
            { id: "error" as StatusFilter, label: "错误", count: errorCount },
          ]).map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === f.id ? "bg-surface-4 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}>
              {f.label} <span className={`ml-1 tabular-nums ${f.id === "success" ? "text-success" : f.id === "error" ? "text-danger" : ""}`}>{f.count}</span>
            </button>
          ))}
        </div>

        {models.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-text-dim" />
            <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
              className="cursor-pointer rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-secondary outline-none focus:border-brand/50">
              <option value="">全部模型</option>
              {models.map(m => <option key={m} value={m}>{shortModel(m)}</option>)}
            </select>
          </div>
        )}

        {(statusFilter !== "all" || modelFilter) && (
          <button onClick={() => { setStatusFilter("all"); setModelFilter("") }}
            className="cursor-pointer text-xs text-brand hover:text-brand-light">清除筛选</button>
        )}

        <span className="ml-auto text-xs text-text-dim">显示 {filtered.length} 条</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-2.5 text-left font-medium">时间</th>
                <th className="px-4 py-2.5 text-left font-medium">密钥</th>
                <th className="px-4 py-2.5 text-left font-medium">模型</th>
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
                <th className="px-4 py-2.5 text-right font-medium">耗时</th>
                <th className="px-4 py-2.5 text-right font-medium">输入</th>
                <th className="px-4 py-2.5 text-right font-medium">输出</th>
                <th className="px-4 py-2.5 text-center font-medium">流式</th>
                <th className="px-4 py-2.5 text-left font-medium">信息</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => <LogRow key={`${e.timestamp}-${i}`} entry={e} />)}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-16 text-center text-text-dim">暂无日志</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LogRow({ entry: e }: { entry: LogEntry }) {
  const time = new Date(e.timestamp * 1000)
  const timeStr = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((n) => String(n).padStart(2, "0")).join(":")
  const ok = e.status >= 200 && e.status < 400

  const statusLabel = e.status === 402 ? "配额" : e.status === 429 ? "限流" : e.status === 502 ? "网关" : ""

  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-surface-2/30">
      <td className="px-4 py-2.5 font-mono text-xs text-text-dim whitespace-nowrap">{timeStr}</td>
      <td className="px-4 py-2.5 text-sm font-medium text-text-secondary">{e.key_name || e.key_id.slice(0, 8)}</td>
      <td className="px-4 py-2.5">
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-muted">{shortModel(e.model)}</span>
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-medium ${
          ok ? "bg-success/10 text-success" : e.status === 429 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
        }`}>
          {e.status}
          {statusLabel && <span className="text-[9px] opacity-70">{statusLabel}</span>}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className={`font-mono text-xs ${e.duration_ms > 5000 ? "text-warning" : "text-text-muted"}`}>{e.duration_ms}ms</span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {e.input_tokens > 0 ? (
          <span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums text-text-secondary">
            <ArrowDownToLine className="h-3 w-3 text-text-dim" />{fmt(e.input_tokens)}
          </span>
        ) : <span className="text-xs text-text-dim">-</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {e.output_tokens > 0 ? (
          <span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums text-text-secondary">
            <ArrowUpFromLine className="h-3 w-3 text-text-dim" />{fmt(e.output_tokens)}
          </span>
        ) : <span className="text-xs text-text-dim">-</span>}
      </td>
      <td className="px-4 py-2.5 text-center">
        {e.is_stream ? <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">SSE</span> : <span className="text-xs text-text-dim">-</span>}
      </td>
      <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-danger" title={e.error || undefined}>{e.error || ""}</td>
    </tr>
  )
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "")
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
