import { useState } from "react"
import type { KeyInfo } from "../api"
import { FlaskConical, RotateCcw, Power, Trash2, Loader2 } from "lucide-react"

function formatTTL(seconds: number): string {
  if (seconds <= 0) return "已过期"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function statusBadge(k: KeyInfo): { text: string; cls: string } {
  if (!k.enabled) return { text: "已禁用", cls: "bg-surface-4 text-text-dim" }
  if (k.status === "invalid") return { text: "已失效", cls: "bg-danger/15 text-danger" }
  if (k.has_token) return { text: "活跃", cls: "bg-success/15 text-success" }
  return { text: "无 Token", cls: "bg-warning/15 text-warning" }
}

export default function KeyTable({ keys, onToggle, onDelete, onTest, onRestore }: {
  keys: KeyInfo[]
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onTest: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
}) {
  const [loading, setLoading] = useState<Record<string, string>>({})

  const withLoading = async (id: string, action: string, fn: () => Promise<void>) => {
    setLoading((s) => ({ ...s, [id]: action }))
    try { await fn() } finally { setLoading((s) => { const n = { ...s }; delete n[id]; return n }) }
  }

  if (keys.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 py-16 text-center">
        <div className="mb-2 text-2xl text-text-dim">No Keys</div>
        <div className="text-sm text-text-muted">点击上方按钮添加密钥</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-2/50 text-xs uppercase tracking-wider text-text-muted">
            <th className="px-4 py-3 text-left font-medium">名称</th>
            <th className="px-4 py-3 text-left font-medium">PAT</th>
            <th className="px-4 py-3 text-left font-medium">状态</th>
            <th className="px-4 py-3 text-left font-medium">失败</th>
            <th className="px-4 py-3 text-left font-medium">权重</th>
            <th className="px-4 py-3 text-left font-medium">Token TTL</th>
            <th className="px-4 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const st = statusBadge(k)
            const busy = loading[k.id]
            return (
              <tr key={k.id} className="border-b border-border/50 transition-colors hover:bg-surface-2/30">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-dim">{k.pat}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      k.status === "invalid" ? "bg-danger" : k.has_token && k.enabled ? "bg-success animate-pulse-dot" : "bg-text-dim"
                    }`} />
                    {st.text}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-text-muted">{k.failure_count}</td>
                <td className="px-4 py-3 text-sm tabular-nums text-text-muted">{k.weight}</td>
                <td className="px-4 py-3 text-sm tabular-nums text-text-muted">{k.has_token ? formatTTL(k.token_ttl) : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-success/10 hover:text-success disabled:opacity-30"
                      onClick={() => withLoading(k.id, "test", () => onTest(k.id))}
                      disabled={!!busy} title="测试"
                    >{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}</button>
                    {k.status === "invalid" && (
                      <button
                        className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warning/10 hover:text-warning disabled:opacity-30"
                        onClick={() => withLoading(k.id, "restore", () => onRestore(k.id))}
                        disabled={!!busy} title="恢复"
                      >{busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</button>
                    )}
                    <button
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-brand/10 hover:text-brand"
                      onClick={() => onToggle(k.id, !k.enabled)} title={k.enabled ? "禁用" : "启用"}
                    ><Power className="h-4 w-4" /></button>
                    <button
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      onClick={() => onDelete(k.id)} title="删除"
                    ><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
