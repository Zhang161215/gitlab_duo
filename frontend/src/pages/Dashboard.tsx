import { useEffect, useState } from "react"
import { useToast } from "../components/Toast"
import { fetchStats, fetchKeys, fetchLogs, getErrorMessage, type StatsInfo, type KeyInfo, type LogsResponse } from "../api"
import { Send, Key, CheckCircle2, Zap, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Clock } from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts"

const COLORS = {
  brand: "#2563eb", success: "#10b981", danger: "#ef4444",
  warning: "#f59e0b", muted: "#71717a", purple: "#8b5cf6",
  cyan: "#06b6d4", orange: "#f97316",
}
const PIE_COLORS = [COLORS.success, COLORS.muted, COLORS.danger, COLORS.warning]
const MODEL_COLORS = [COLORS.brand, COLORS.purple, COLORS.cyan, COLORS.orange, COLORS.success]

export default function Dashboard() {
  const [stats, setStats] = useState<StatsInfo>({
    total_requests: 0, active_keys: 0, success_rate: 100,
    total_input_tokens: 0, total_output_tokens: 0, per_key: {},
  })
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [logs, setLogs] = useState<LogsResponse>({ entries: [], total: 0 })
  const { toast } = useToast()

  useEffect(() => {
    let disposed = false
    let active: AbortController | null = null
    const load = async (showError: boolean) => {
      active?.abort()
      const ctrl = active = new AbortController()
      try {
        const [s, k, l] = await Promise.all([
          fetchStats(ctrl.signal), fetchKeys(ctrl.signal), fetchLogs(100, 0, ctrl.signal),
        ])
        if (!disposed) { setStats(s); setKeys(k); setLogs(l) }
      } catch (e) {
        if (showError && !ctrl.signal.aborted && !disposed) toast(getErrorMessage(e), "error")
      }
    }
    void load(true)
    const timer = setInterval(() => void load(false), 5000)
    return () => { disposed = true; clearInterval(timer); active?.abort() }
  }, [toast])

  // Derived data
  const keyMap = Object.fromEntries(keys.map((k) => [k.id, k.name]))
  const activeKeys = keys.filter(k => k.enabled && k.status === "active")
  const disabledKeys = keys.filter(k => !k.enabled)
  const invalidKeys = keys.filter(k => k.status === "invalid")
  const withToken = keys.filter(k => k.has_token)

  // Key health pie data
  const keyHealthData = [
    { name: "活跃", value: activeKeys.length },
    { name: "禁用", value: disabledKeys.length },
    { name: "失效", value: invalidKeys.length },
    { name: "冷却", value: keys.filter(k => (k.cooldown_remaining ?? 0) > 0).length },
  ].filter(d => d.value > 0)

  // Request timeline (aggregate logs by minute)
  const timelineData = buildTimeline(logs.entries)

  // Model distribution from logs
  const modelData = buildModelDist(logs.entries)

  // Per-key ranking
  const perKeyEntries = Object.entries(stats.per_key)
    .map(([kid, s]) => ({ name: keyMap[kid] || kid.slice(0, 8), ...s }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // Recent requests (last 8)
  const recentLogs = logs.entries.slice(0, 8)

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">仪表盘</h1>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: "3s" }} />
          5s 自动刷新
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<Send className="h-4 w-4" />} label="总请求" value={fmt(stats.total_requests)} color="brand" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="成功率" value={`${stats.success_rate}%`}
          color={stats.success_rate >= 95 ? "success" : stats.success_rate >= 80 ? "warning" : "danger"} />
        <StatCard icon={<Key className="h-4 w-4" />} label="密钥"
          value={`${activeKeys.length}/${keys.length}`} sub={`${withToken.length} 有 Token`} color="brand" />
        <StatCard icon={<ArrowDownToLine className="h-4 w-4" />} label="输入 Tokens" value={fmt(stats.total_input_tokens)} color="cyan" />
        <StatCard icon={<ArrowUpFromLine className="h-4 w-4" />} label="输出 Tokens" value={fmt(stats.total_output_tokens)} color="purple" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Request Timeline */}
        <div className="card lg:col-span-2">
          <div className="card-title">请求趋势</div>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.danger} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.danger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} width={30} />
                <ReTooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#a1a1aa" }} itemStyle={{ padding: 0 }} />
                <Area type="monotone" dataKey="success" stroke={COLORS.success} fill="url(#gSuccess)" strokeWidth={2} name="成功" />
                <Area type="monotone" dataKey="fail" stroke={COLORS.danger} fill="url(#gFail)" strokeWidth={2} name="失败" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-text-dim">暂无请求数据</div>
          )}
        </div>

        {/* Key Health Donut */}
        <div className="card">
          <div className="card-title">密钥健康</div>
          {keyHealthData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={keyHealthData} innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                    {keyHealthData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {keyHealthData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-text-secondary">{d.name}</span>
                    </span>
                    <span className="font-mono font-medium text-text-primary">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-[120px] items-center justify-center text-sm text-text-dim">暂无密钥</div>
          )}
        </div>
      </div>

      {/* Model Distribution + Per-Key Ranking */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Model Distribution */}
        <div className="card">
          <div className="card-title">模型使用分布</div>
          {modelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={modelData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={90} />
                <ReTooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#a1a1aa" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} name="请求数">
                  {modelData.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-text-dim">暂无数据</div>
          )}
        </div>

        {/* Per-Key Ranking */}
        <div className="card">
          <div className="card-title">密钥请求排行</div>
          {perKeyEntries.length > 0 ? (
            <div className="space-y-2.5">
              {perKeyEntries.map((k, i) => {
                const max = perKeyEntries[0]?.total || 1
                const pct = Math.round((k.total / max) * 100)
                return (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-text-secondary">{k.name}</span>
                      <span className="tabular-nums text-text-muted">{k.total} 次 · <span className="text-success">{k.success}</span>/<span className="text-danger">{k.failures}</span></span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-text-dim">暂无数据</div>
          )}
        </div>
      </div>

      {/* Recent Requests */}
      <div className="card">
        <div className="card-title flex items-center justify-between">
          <span>最近请求</span>
          <span className="text-xs font-normal text-text-dim">共 {logs.total} 条</span>
        </div>
        {recentLogs.length > 0 ? (
          <div className="space-y-1">
            {recentLogs.map((e, i) => {
              const time = new Date(e.timestamp * 1000)
              const timeStr = [time.getHours(), time.getMinutes(), time.getSeconds()].map(n => String(n).padStart(2, "0")).join(":")
              const ok = e.status >= 200 && e.status < 400
              return (
                <div key={`${e.timestamp}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-2">
                  <span className="w-14 shrink-0 font-mono text-xs text-text-dim">{timeStr}</span>
                  <span className="w-16 shrink-0 truncate font-medium text-text-secondary">{e.key_name || e.key_id.slice(0, 6)}</span>
                  <span className="w-20 shrink-0 text-xs text-text-muted">{shortModel(e.model)}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium ${ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{e.status}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-text-dim">{e.duration_ms}ms</span>
                  <div className="flex flex-1 items-center justify-end gap-3 text-xs text-text-muted">
                    {e.input_tokens > 0 && <span className="flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" />{fmt(e.input_tokens)}</span>}
                    {e.output_tokens > 0 && <span className="flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3" />{fmt(e.output_tokens)}</span>}
                    {e.is_stream && <span className="rounded bg-surface-3 px-1 py-0.5 text-[10px]">SSE</span>}
                  </div>
                  {e.error && <span className="max-w-[120px] truncate text-xs text-danger" title={e.error}>{e.error}</span>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-text-dim">暂无请求记录</div>
        )}
      </div>
    </div>
  )
}

// --- Stat Card ---
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string
  color: "brand" | "success" | "warning" | "danger" | "cyan" | "purple"
}) {
  const colorMap = {
    brand: "bg-brand/10 text-brand", success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger",
    cyan: "bg-info/10 text-info", purple: "bg-purple-500/10 text-purple-400",
  }
  return (
    <div className="card group cursor-default transition-all hover:border-border-light">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorMap[color]}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted">{label}</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-text-primary">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-text-dim">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

// --- Helpers ---
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "")
}

function buildTimeline(entries: { timestamp: number; status: number }[]): { time: string; success: number; fail: number }[] {
  if (entries.length === 0) return []
  const buckets: Record<string, { success: number; fail: number }> = {}
  for (const e of entries) {
    const d = new Date(e.timestamp * 1000)
    const key = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    if (!buckets[key]) buckets[key] = { success: 0, fail: 0 }
    if (e.status >= 200 && e.status < 400) buckets[key].success++
    else buckets[key].fail++
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, d]) => ({ time, ...d }))
}

function buildModelDist(entries: { model: string }[]): { name: string; count: number }[] {
  const m: Record<string, number> = {}
  for (const e of entries) {
    const short = shortModel(e.model)
    m[short] = (m[short] || 0) + 1
  }
  return Object.entries(m)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
