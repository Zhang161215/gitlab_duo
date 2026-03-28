import { useEffect, useState } from "react"
import { useToast } from "../components/Toast"
import { fetchLogs, getErrorMessage, type LogEntry, type LogsResponse } from "../api"

export default function Logs() {
  const [data, setData] = useState<LogsResponse>({ entries: [], total: 0 })
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

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">请求日志</h1>
        <span className="text-xs text-text-muted">
          共 {data.total} 条（显示最近 {data.entries.length} 条，3s 刷新）
        </span>
      </div>

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
                <th className="px-4 py-2.5 text-left font-medium">错误</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e, i) => (
                <LogRow key={`${e.timestamp}-${i}`} entry={e} />
              ))}
              {data.entries.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-text-muted">暂无日志</td></tr>
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

  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-surface-2/30">
      <td className="px-4 py-2 font-mono text-xs text-text-dim">{timeStr}</td>
      <td className="px-4 py-2 text-sm font-medium text-text-secondary">{e.key_name || e.key_id.slice(0, 8)}</td>
      <td className="px-4 py-2 text-xs text-text-muted">{shortModel(e.model)}</td>
      <td className="px-4 py-2">
        <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-medium ${
          ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
        }`}>{e.status}</span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs text-text-muted">{e.duration_ms}ms</td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-text-secondary">{e.input_tokens || "-"}</td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-text-secondary">{e.output_tokens || "-"}</td>
      <td className="px-4 py-2 text-center text-xs text-text-dim">{e.is_stream ? "SSE" : "-"}</td>
      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-danger">{e.error}</td>
    </tr>
  )
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "")
}
