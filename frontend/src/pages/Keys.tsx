import { useEffect, useState } from "react"
import AddKeyDialog from "../components/AddKeyDialog"
import { useToast } from "../components/Toast"
import {
  addKey, deleteKey, fetchKeys, getErrorMessage, testKey, updateKey, restoreKey,
  batchImportKeys, batchTestKeys, exportKeys, type KeyInfo,
} from "../api"
import {
  Plus, FlaskConical, Download, Upload, X, Loader2,
  Power, Trash2, RotateCcw, LayoutGrid, List, Clock, AlertTriangle,
} from "lucide-react"

type Filter = "all" | "active" | "disabled" | "invalid"

export default function Keys() {
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchText, setBatchText] = useState("")
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchTesting, setBatchTesting] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const [view, setView] = useState<"card" | "table">("card")
  const [loading, setLoading] = useState<Record<string, string>>({})
  const { toast } = useToast()

  useEffect(() => {
    let disposed = false
    const controllers = new Set<AbortController>()
    const poll = async (showError: boolean) => {
      const ctrl = new AbortController()
      controllers.add(ctrl)
      try {
        const data = await fetchKeys(ctrl.signal)
        if (!disposed) setKeys(data)
      } catch (e) {
        if (showError && !ctrl.signal.aborted && !disposed) toast(getErrorMessage(e), "error")
      } finally { controllers.delete(ctrl) }
    }
    void poll(true)
    const timer = setInterval(() => void poll(false), 5000)
    return () => { disposed = true; clearInterval(timer); controllers.forEach((c) => c.abort()) }
  }, [toast])

  const reload = async () => { try { setKeys(await fetchKeys()) } catch { /* polling */ } }

  const withLoading = async (id: string, action: string, fn: () => Promise<void>) => {
    setLoading((s) => ({ ...s, [id]: action }))
    try { await fn() } finally { setLoading((s) => { const n = { ...s }; delete n[id]; return n }) }
  }

  const handleAdd = async (name: string, pat: string) => {
    try { await addKey(name, pat); toast("密钥已添加") } catch (e) { toast(getErrorMessage(e), "error"); throw e }
    await reload()
  }
  const handleToggle = async (id: string, enabled: boolean) => {
    try { await updateKey(id, { enabled }); toast(enabled ? "已启用" : "已禁用"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return
    try { await deleteKey(id); toast("已删除"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleTest = async (id: string) => {
    try {
      const res = await testKey(id)
      toast(res.message, res.valid ? "success" : "error")
      await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleRestore = async (id: string) => {
    try { await restoreKey(id); toast("密钥已恢复"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleBatchImport = async () => {
    if (!batchText.trim()) return
    setBatchImporting(true)
    try {
      const res = await batchImportKeys(batchText)
      toast(`已添加 ${res.added} 个${res.skipped > 0 ? `，跳过 ${res.skipped} 个重复` : ""}`)
      setBatchText(""); setShowBatchImport(false); await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
    finally { setBatchImporting(false) }
  }
  const handleBatchTest = async () => {
    setBatchTesting(true)
    try {
      const results = await batchTestKeys()
      const ok = results.filter((r) => r.valid).length
      toast(`批量测试：${ok} 成功，${results.length - ok} 失败`)
      await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
    finally { setBatchTesting(false) }
  }
  const handleExport = async () => {
    try {
      const text = await exportKeys()
      if (!text.trim()) { toast("没有可导出的密钥", "error"); return }
      const blob = new Blob([text], { type: "text/plain" })
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gitlab-pats.txt"; a.click()
      URL.revokeObjectURL(a.href); toast("已导出")
    } catch (e) { toast(getErrorMessage(e), "error") }
  }

  // Filter
  const counts = {
    all: keys.length,
    active: keys.filter(k => k.enabled && k.status === "active").length,
    disabled: keys.filter(k => !k.enabled).length,
    invalid: keys.filter(k => k.status === "invalid").length,
  }
  const filtered = keys.filter(k => {
    if (filter === "active") return k.enabled && k.status === "active"
    if (filter === "disabled") return !k.enabled
    if (filter === "invalid") return k.status === "invalid"
    return true
  })

  const FILTERS: { id: Filter; label: string; color: string }[] = [
    { id: "all", label: "全部", color: "text-text-secondary" },
    { id: "active", label: "活跃", color: "text-success" },
    { id: "disabled", label: "禁用", color: "text-text-dim" },
    { id: "invalid", label: "失效", color: "text-danger" },
  ]

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary">密钥管理</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => void handleBatchTest()} disabled={batchTesting || keys.length === 0}>
            {batchTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} 批量测试
          </button>
          <button className="btn-secondary" onClick={() => void handleExport()} disabled={keys.length === 0}>
            <Download className="h-4 w-4" /> 导出
          </button>
          <button className="btn-secondary" onClick={() => setShowBatchImport(true)}>
            <Upload className="h-4 w-4" /> 导入
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> 添加密钥
          </button>
        </div>
      </div>

      {/* Filter tabs + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                filter === f.id ? "bg-surface-4 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}>
              {f.label} <span className={`ml-1 tabular-nums ${filter === f.id ? f.color : ""}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          <button onClick={() => setView("card")} className={`cursor-pointer rounded-md p-1.5 transition-all ${view === "card" ? "bg-surface-4 text-text-primary" : "text-text-muted"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("table")} className={`cursor-pointer rounded-md p-1.5 transition-all ${view === "table" ? "bg-surface-4 text-text-primary" : "text-text-muted"}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card View */}
      {view === "card" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(k => (
            <KeyCard key={k.id} k={k} busy={loading[k.id]}
              onTest={() => withLoading(k.id, "test", () => handleTest(k.id))}
              onRestore={() => withLoading(k.id, "restore", () => handleRestore(k.id))}
              onToggle={() => handleToggle(k.id, !k.enabled)}
              onDelete={() => handleDelete(k.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-border bg-surface-1 py-16 text-center text-sm text-text-dim">
              {keys.length === 0 ? "还没有密钥，点击上方「添加密钥」" : "没有匹配的密钥"}
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3 text-left font-medium">名称</th>
                <th className="px-4 py-3 text-left font-medium">PAT</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">Token</th>
                <th className="px-4 py-3 text-left font-medium">失败</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => {
                const st = statusInfo(k)
                const busy = loading[k.id]
                return (
                  <tr key={k.id} className="border-b border-border/50 transition-colors hover:bg-surface-2/30">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-dim">{k.pat}</td>
                    <td className="px-4 py-3"><StatusBadge {...st} /></td>
                    <td className="px-4 py-3 text-sm tabular-nums text-text-muted">{k.has_token ? fmtTTL(k.token_ttl) : "-"}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-text-muted">{k.failure_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn icon={busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} onClick={() => withLoading(k.id, "test", () => handleTest(k.id))} disabled={!!busy} title="测试" hoverColor="success" />
                        {k.status === "invalid" && <IconBtn icon={busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} onClick={() => withLoading(k.id, "restore", () => handleRestore(k.id))} disabled={!!busy} title="恢复" hoverColor="warning" />}
                        <IconBtn icon={<Power className="h-4 w-4" />} onClick={() => handleToggle(k.id, !k.enabled)} title={k.enabled ? "禁用" : "启用"} hoverColor="brand" />
                        <IconBtn icon={<Trash2 className="h-4 w-4" />} onClick={() => handleDelete(k.id)} title="删除" hoverColor="danger" />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddKeyDialog open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />

      {/* Batch Import Dialog */}
      {showBatchImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !batchImporting && setShowBatchImport(false)}>
          <div className="animate-fade-in w-full max-w-lg rounded-2xl border border-border bg-surface-2 p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">批量导入密钥</h2>
              <button onClick={() => setShowBatchImport(false)} disabled={batchImporting} className="cursor-pointer rounded-lg p-1 text-text-muted hover:bg-surface-4"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-text-muted">每行一个 PAT，支持「名称:PAT」格式。</p>
            <textarea className="h-40 w-full resize-none rounded-lg border border-border bg-surface-3 px-4 py-3 font-mono text-sm text-text-primary outline-none placeholder:text-text-dim focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              value={batchText} onChange={(e) => setBatchText(e.target.value)} placeholder={"Key 1:glpat-xxxx\nglpat-yyyy"} disabled={batchImporting} autoFocus />
            <div className="mt-4 flex justify-end gap-3">
              <button className="cursor-pointer rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary" onClick={() => setShowBatchImport(false)} disabled={batchImporting}>取消</button>
              <button className="btn-primary" onClick={() => void handleBatchImport()} disabled={batchImporting || !batchText.trim()}>
                {batchImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> 导入中...</> : "导入"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Key Card ---
function KeyCard({ k, busy, onTest, onRestore, onToggle, onDelete }: {
  k: KeyInfo; busy?: string
  onTest: () => void; onRestore: () => void; onToggle: () => void; onDelete: () => void
}) {
  const st = statusInfo(k)
  const ttlPct = k.has_token ? Math.min(100, Math.max(0, (k.token_ttl / 7200) * 100)) : 0
  const ttlColor = ttlPct > 50 ? "bg-success" : ttlPct > 20 ? "bg-warning" : "bg-danger"
  const cooldown = k.cooldown_remaining ?? 0

  return (
    <div className="group rounded-xl border border-border bg-surface-1 p-4 transition-all hover:border-border-light">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{k.name}</span>
          <StatusBadge {...st} />
        </div>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn icon={busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} onClick={onTest} disabled={!!busy} title="测试" hoverColor="success" small />
          {k.status === "invalid" && <IconBtn icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onRestore} disabled={!!busy} title="恢复" hoverColor="warning" small />}
          <IconBtn icon={<Power className="h-3.5 w-3.5" />} onClick={onToggle} title={k.enabled ? "禁用" : "启用"} hoverColor="brand" small />
          <IconBtn icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete} title="删除" hoverColor="danger" small />
        </div>
      </div>

      {/* Token TTL Bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-text-muted">Token TTL</span>
          <span className="tabular-nums text-text-dim">{k.has_token ? fmtTTL(k.token_ttl) : "无 Token"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className={`h-full rounded-full transition-all duration-500 ${ttlColor}`} style={{ width: `${ttlPct}%` }} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[10px] text-text-dim">权重</div>
          <div className="text-sm font-medium tabular-nums text-text-secondary">{k.weight}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[10px] text-text-dim">失败</div>
          <div className={`text-sm font-medium tabular-nums ${k.failure_count > 0 ? "text-danger" : "text-text-secondary"}`}>{k.failure_count}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[10px] text-text-dim">冷却</div>
          <div className={`text-sm font-medium tabular-nums ${cooldown > 0 ? "text-warning" : "text-text-secondary"}`}>
            {cooldown > 0 ? `${Math.ceil(cooldown / 60)}m` : "-"}
          </div>
        </div>
      </div>

      {/* Cooldown warning */}
      {cooldown > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-xs text-warning">
          <Clock className="h-3 w-3" />
          配额冷却中，{Math.ceil(cooldown / 60)} 分钟后恢复
        </div>
      )}

      {/* PAT */}
      <div className="mt-2 font-mono text-[10px] text-text-dim">{k.pat}</div>
    </div>
  )
}

// --- Shared components ---
function StatusBadge({ text, dotCls, bgCls }: { text: string; dotCls: string; bgCls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${bgCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
      {text}
    </span>
  )
}

function IconBtn({ icon, onClick, disabled, title, hoverColor, small }: {
  icon: React.ReactNode; onClick: () => void; disabled?: boolean; title: string
  hoverColor: "brand" | "success" | "warning" | "danger"; small?: boolean
}) {
  const hoverMap = {
    brand: "hover:bg-brand/10 hover:text-brand-light",
    success: "hover:bg-success/10 hover:text-success",
    warning: "hover:bg-warning/10 hover:text-warning",
    danger: "hover:bg-danger/10 hover:text-danger",
  }
  return (
    <button className={`cursor-pointer rounded-lg text-text-muted transition-colors disabled:opacity-30 ${hoverMap[hoverColor]} ${small ? "p-1" : "p-1.5"}`}
      onClick={onClick} disabled={disabled} title={title}>
      {icon}
    </button>
  )
}

function statusInfo(k: KeyInfo): { text: string; dotCls: string; bgCls: string } {
  if (!k.enabled) return { text: "已禁用", dotCls: "bg-text-dim", bgCls: "bg-surface-4 text-text-dim" }
  if (k.status === "invalid") return { text: "已失效", dotCls: "bg-danger", bgCls: "bg-danger/15 text-danger" }
  if ((k.cooldown_remaining ?? 0) > 0) return { text: "冷却中", dotCls: "bg-warning", bgCls: "bg-warning/15 text-warning" }
  if (k.has_token) return { text: "活跃", dotCls: "bg-success animate-pulse-dot", bgCls: "bg-success/15 text-success" }
  return { text: "无Token", dotCls: "bg-warning", bgCls: "bg-warning/15 text-warning" }
}

function fmtTTL(seconds: number): string {
  if (seconds <= 0) return "已过期"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
