import { useEffect, useState } from "react"
import StatsCard from "../components/StatsCard"
import { useToast } from "../components/Toast"
import { fetchStats, fetchKeys, getErrorMessage, type StatsInfo, type KeyInfo } from "../api"
import { Send, Key, CheckCircle2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"

export default function Dashboard() {
  const [stats, setStats] = useState<StatsInfo>({
    total_requests: 0, active_keys: 0, success_rate: 100,
    total_input_tokens: 0, total_output_tokens: 0, per_key: {},
  })
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const { toast } = useToast()

  useEffect(() => {
    let disposed = false
    let active: AbortController | null = null
    const load = async (showError: boolean) => {
      active?.abort()
      const ctrl = active = new AbortController()
      try {
        const [s, k] = await Promise.all([fetchStats(ctrl.signal), fetchKeys(ctrl.signal)])
        if (!disposed) { setStats(s); setKeys(k) }
      } catch (e) {
        if (showError && !ctrl.signal.aborted && !disposed) toast(getErrorMessage(e), "error")
      }
    }
    void load(true)
    const timer = setInterval(() => void load(false), 5000)
    return () => { disposed = true; clearInterval(timer); active?.abort() }
  }, [toast])

  const keyMap = Object.fromEntries(keys.map((k) => [k.id, k.name]))
  const perKeyEntries = Object.entries(stats.per_key)

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-xl font-bold text-text-primary">仪表盘</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatsCard icon={<Send className="h-4 w-4" />} title="总请求数" value={stats.total_requests} />
        <StatsCard icon={<Key className="h-4 w-4" />} title="活跃密钥" value={stats.active_keys} />
        <StatsCard icon={<CheckCircle2 className="h-4 w-4" />} title="成功率" value={`${stats.success_rate}%`} />
        <StatsCard icon={<ArrowDownToLine className="h-4 w-4" />} title="输入 Tokens" value={fmt(stats.total_input_tokens)} />
        <StatsCard icon={<ArrowUpFromLine className="h-4 w-4" />} title="输出 Tokens" value={fmt(stats.total_output_tokens)} />
      </div>

      {perKeyEntries.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Per-Key 统计</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-4">密钥</th>
                  <th className="pb-2 pr-4">请求</th>
                  <th className="pb-2 pr-4">成功</th>
                  <th className="pb-2 pr-4">失败</th>
                  <th className="pb-2 pr-4">输入</th>
                  <th className="pb-2 pr-4">输出</th>
                  <th className="pb-2">最后使用</th>
                </tr>
              </thead>
              <tbody>
                {perKeyEntries.map(([kid, s]) => (
                  <tr key={kid} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="py-2.5 pr-4 font-medium text-text-primary">{keyMap[kid] || kid.slice(0, 8)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-text-secondary">{s.total}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-success">{s.success}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-danger">{s.failures}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-text-secondary">{fmt(s.input_tokens)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-text-secondary">{fmt(s.output_tokens)}</td>
                    <td className="py-2.5 text-text-dim">{s.last_used ? timeAgo(s.last_used) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "刚刚"
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}
